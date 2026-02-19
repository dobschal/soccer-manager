import { query } from './lib/database.js'
import { ActionCard } from './entities/actionCard.js'
import { getSponsor } from './helper/sponsorHelper.js'
import { updateTeamBalance } from './helper/financeHelper.js'
import { getSalary } from '../client/util/player.js'
import { getGameDayAndSeason } from './helper/gameDayHelper.js'
import { getPlayerAge } from './helper/playerHelper.js'
import { actionCardChances, deleteExpiredPendingCards } from './helper/actionCardHelper.js'
import { generateNewsForGameDay } from './helper/newsHelper.js'
import { completeStadiumConstructions } from './helper/stadiumHelper.js'
import { completeBuildingConstructions, getAllTrainingAreaLevels, getAllFitnessStudioLevels, TRAINING_AREA_CARD_CHANCES, FITNESS_STUDIO_CARD_CHANCES } from './helper/buildingHelper.js'
import { addLogMessage, checkTeamAndNotify } from './helper/logMessageHelper.js'
import { getUserLocale, t } from './i18n/index.js'
import { processYouthTraining } from './helper/youthPlayerHelper.js'
import { cacheStandingsForGameDay } from './helper/standingHelper.js'
import { cachePlayerStatsForGameDay } from './helper/playerStatsHelper.js'
import { CACHE_NAMESPACES, clearCacheByPrefix } from './lib/cache.js'
import { getCupRoundsForSeason, progressCupRound, sendCupMatchLogMessages } from './helper/cupHelper.js'
import { kickoff, playGameStep } from './play-game.js'

/**
 * @returns {Promise<void>}
 */
export async function calculateGames () {
  const {
    gameDay,
    season
  } = await getGameDayAndSeason()
  console.log(`Calculate games for season ${season} game day ${gameDay}`)

  // Complete any constructions that are due
  await completeStadiumConstructions(gameDay, season)
  await completeBuildingConstructions(gameDay, season)

  // Play league games
  const leagueGames = await query(
    'SELECT * FROM game WHERE season=? AND game_day=? AND played=0 AND (game_type=\'league\' OR game_type IS NULL)',
    [season, gameDay]
  )
  if (leagueGames.length > 0) {
    await Promise.all(leagueGames.map(game => _playGame(game)))
  }

  // Play cup games for this game day
  await _playCupGames(gameDay, season)

  // Clear season results cache after games are played
  clearCacheByPrefix(CACHE_NAMESPACES.SEASON_RESULTS)
  await cacheStandingsForGameDay(gameDay, season)
  await cachePlayerStatsForGameDay(gameDay, season)
  await deleteExpiredPendingCards()
  await _giveUsersActionCards()
  await _letTeamsPaySallaries(gameDay, season)
  await _giveSponsorMoney(gameDay, season)
  await _giveAllPlayersFreshness(season)
  await _processYouthTeams()
  await generateNewsForGameDay(gameDay, season)
  await _checkUserTeamsForIssues()
  console.log('\n\nPlayed game day ' + gameDay)
}

/**
 * Play cup games for the current game day and progress rounds if complete
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
async function _playCupGames (gameDay, season) {
  const cupGames = await query(
    'SELECT * FROM game WHERE season=? AND game_day=? AND played=0 AND game_type=\'cup\'',
    [season, gameDay]
  )

  if (cupGames.length > 0) {
    console.log(`Playing ${cupGames.length} cup games...`)

    // Track which rounds had games played this game day
    const roundsPlayed = new Set()
    for (const game of cupGames) {
      await _playCupGame(game)
      roundsPlayed.add(game.cup_round)
    }

    // Progress rounds that just had all their games completed
    for (const roundNumber of roundsPlayed) {
      const result = await progressCupRound(season, roundNumber)
      if (result.isComplete) {
        console.log('🏆 Cup is complete!')
      } else if (result.advanced) {
        console.log(`Cup round ${roundNumber} complete, advanced to next round`)
      }
    }
  } else {
    console.log('No cup games to play on this game day')
  }

  // Catch-up: check for any fully played rounds that were never progressed
  await _progressUnhandledCupRounds(season)
}

/**
 * Check for cup rounds where all games are played but the next round was never created.
 * This handles recovery from the bug where progression was skipped.
 * @param {number} season
 * @returns {Promise<void>}
 */
async function _progressUnhandledCupRounds (season) {
  const rounds = await getCupRoundsForSeason(season)

  for (const round of rounds) {
    if (!round.played) continue

    // Check if this round has already been progressed by looking for next round games
    const nextRoundNumber = Math.floor(round.round / 2)
    if (nextRoundNumber >= 1) {
      const [{ count }] = await query(
        'SELECT COUNT(*) as count FROM game WHERE game_type=\'cup\' AND season=? AND cup_round=?',
        [season, nextRoundNumber]
      )
      if (count > 0) continue // Next round already exists
    } else {
      continue // round.round is 1 (the final) and it's played — cup is done
    }

    console.log(`Cup catch-up: round ${round.round} was played but never progressed, fixing now...`)
    const result = await progressCupRound(season, round.round)
    if (result.isComplete) {
      console.log('🏆 Cup is complete!')
    } else if (result.advanced) {
      console.log(`Cup round ${round.round} complete, advanced to next round`)
    }
  }
}

/**
 * Play a single cup game (similar to _playGame but with cup-specific handling)
 * @param {GameType} game
 * @returns {Promise<void>}
 */
async function _playCupGame (game) {
  const [[teamA], [teamB], allPlayerTeamA, allPlayerTeamB] = await Promise.all([
    await query('SELECT * FROM team WHERE id=?', [game.team_1_id]),
    await query('SELECT * FROM team WHERE id=?', [game.team_2_id]),
    await query('SELECT * FROM player WHERE team_id=? AND in_game_position<>\'\' AND in_game_position IS NOT NULL', [game.team_1_id]),
    await query('SELECT * FROM player WHERE team_id=? AND in_game_position<>\'\' AND in_game_position IS NOT NULL', [game.team_2_id])
  ])

  // Filter out suspended players (they miss this game)
  const playerTeamA = allPlayerTeamA.filter(p => !p.is_suspended)
  const playerTeamB = allPlayerTeamB.filter(p => !p.is_suspended)

  // Clear suspensions for ALL players on both teams who served their ban (not just those in lineup)
  const clearedA = await query(
    'UPDATE player SET is_suspended=0, yellow_cards=0, red_cards=0 WHERE team_id=? AND is_suspended=1',
    [game.team_1_id]
  )
  const clearedB = await query(
    'UPDATE player SET is_suspended=0, yellow_cards=0, red_cards=0 WHERE team_id=? AND is_suspended=1',
    [game.team_2_id]
  )
  if (clearedA.affectedRows > 0 || clearedB.affectedRows > 0) {
    console.log(`Cup suspensions cleared: ${clearedA.affectedRows} for ${teamA.name}, ${clearedB.affectedRows} for ${teamB.name}`)
  }

  const strengthTeamA = playerTeamA.reduce((totalStrength, player) => totalStrength + player.level, 0)
  const strengthTeamB = playerTeamB.reduce((totalStrength, player) => totalStrength + player.level, 0)

  // Cup games don't have stadium earnings (neutral venue concept)
  console.log(`\n\n🏆 Cup match: ${teamA.name} (${strengthTeamA}) vs ${teamB.name} (${strengthTeamB})`)

  const gameDetails = {
    log: [],
    goalsTeamB: 0,
    goalsTeamA: 0,
    strengthTeamA,
    strengthTeamB,
    stadiumDetails: {},
    playerTeamA,
    playerTeamB,
    teamA,
    teamB,
    isCup: true
  }

  for (const player of playerTeamA) {
    player.level = player.freshness * player.level
  }
  for (const player of playerTeamB) {
    player.level = player.freshness * player.level
  }

  kickoff(playerTeamA, playerTeamB, gameDetails)
  const overtime = Math.floor(Math.random() * 50)
  const totalSteps = 900 + overtime
  for (let step = 0; step < totalSteps; step++) {
    // Convert step to match minute (0-89 for regular time, 90+ for overtime)
    gameDetails.currentMinute = step < 900 ? Math.floor(step / 10) : 90 + Math.floor((step - 900) / 10)
    playGameStep(playerTeamA, playerTeamB, gameDetails)
  }
  delete gameDetails.currentMinute // Don't persist internal tracking field

  await query('UPDATE game SET details=?, played=1, goals_team_1=?, goals_team_2=?, created_at=? WHERE id=?', [
    JSON.stringify(gameDetails),
    gameDetails.goalsTeamA,
    gameDetails.goalsTeamB,
    new Date(),
    game.id
  ])

  // Update freshness and card counts for cup games too
  const freshnessLossByStyle = {
    aggressive: 0.15,
    normal: 0.13,
    friendly: 0.11
  }
  for (const player of playerTeamA) {
    const playStyle = teamA.play_style || 'normal'
    const freshnessLoss = player.position === 'GK' ? 0.08 : freshnessLossByStyle[playStyle]
    player.freshness = Math.max(0, player.freshness - freshnessLoss)
    await _updatePlayerAfterGame(player, gameDetails, teamA)
  }
  for (const player of playerTeamB) {
    const playStyle = teamB.play_style || 'normal'
    const freshnessLoss = player.position === 'GK' ? 0.08 : freshnessLossByStyle[playStyle]
    player.freshness = Math.max(0, player.freshness - freshnessLoss)
    await _updatePlayerAfterGame(player, gameDetails, teamB)
  }

  // Send log messages to team owners about the cup match result
  await sendCupMatchLogMessages(game, gameDetails)
}

/**
 * Checks all user teams for issues and notifies them
 * @returns {Promise<void>}
 */
async function _checkUserTeamsForIssues () {
  const t1 = Date.now()
  const teams = await query('SELECT * FROM team WHERE user_id IS NOT NULL')
  await Promise.all(teams.map(team => checkTeamAndNotify(team)))
  console.log(`Checked user teams for issues in ${Date.now() - t1}ms`)
}

/**
 * Process youth training for all teams
 * @returns {Promise<void>}
 */
async function _processYouthTeams () {
  const t1 = Date.now()
  const teams = await query('SELECT * FROM team')
  await Promise.all(teams.map(team => processYouthTraining(team)))
  console.log(`Processed youth teams in ${Date.now() - t1}ms`)
}

/**
 * @param {number} season
 * @returns {Promise<void>}
 */
async function _giveAllPlayersFreshness (season) {
  /** @type {PlayerType[]} */
  const players = await query('SELECT * FROM player WHERE freshness < 1.0')
  const promises = []
  for (const player of players) {
    const age = await getPlayerAge(player, season)
    if (age <= 21) {
      player.freshness = Math.min(1.0, player.freshness + 0.1)
    } else if (age <= 26) {
      player.freshness = Math.min(1.0, player.freshness + 0.08)
    } else if (age <= 29) {
      player.freshness = Math.min(1.0, player.freshness + 0.06)
    } else if (age <= 32) {
      player.freshness = Math.min(1.0, player.freshness + 0.05)
    } else {
      player.freshness = Math.min(1.0, player.freshness + 0.04)
    }
    if (!player.in_game_position) {
      player.freshness = Math.min(1.0, player.freshness + 0.03)
    }
    promises.push(query('UPDATE player SET freshness=? WHERE id=?', [player.freshness, player.id]))
  }
  await Promise.all(promises)
}

/**
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
async function _giveSponsorMoney (gameDay, season) {
  const t1 = Date.now()
  /** @type {Array<import('./entities/team.js').TeamType>} */
  const teams = await query('SELECT * FROM team')

  await Promise.all(teams.map(async team => {
    const t1 = Date.now()
    const { sponsor } = await getSponsor(team, {
      gameDay,
      season
    })
    console.log('Get team sponsor in ' + (Date.now() - t1) + 'ms')
    if (!sponsor) return
    const locale = await getUserLocale(team.user_id)
    const reason = t('finance.sponsorDeal', { name: sponsor.name }, locale)
    await updateTeamBalance(team, sponsor.value, reason, gameDay, season)
  }))
  console.log('Gave all teams their sponsor money in' + (Date.now() - t1) + 'ms')
}

/**
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
async function _letTeamsPaySallaries (gameDay, season) {
  const t1 = Date.now()
  const teams = await query('SELECT * FROM team')
  await Promise.all(teams.map(async team => {
    const players = await query('SELECT * FROM player WHERE team_ID=?', [team.id])
    const totalSallaryCosts = players.reduce((total, player) => total + getSalary(player.level), 0) * -1
    const locale = await getUserLocale(team.user_id)
    const reason = t('finance.playerSalaries', {}, locale)
    await updateTeamBalance(team, totalSallaryCosts, reason, gameDay, season)
  }))
  console.log('Paid all salaries in' + (Date.now() - t1) + 'ms')
}

/**
 * @returns {Promise<void>}
 */
async function _giveUsersActionCards () {
  const t1 = Date.now()
  /** @type {TeamType[]} */
  const teams = await query('SELECT * FROM team')
  const trainingAreaLevels = await getAllTrainingAreaLevels()
  const fitnessStudioLevels = await getAllFitnessStudioLevels()
  const promises = []
  for (const team of teams) {
    const trainingLevel = trainingAreaLevels.get(team.id) ?? 1
    const cardOverrides = TRAINING_AREA_CARD_CHANCES[trainingLevel] || TRAINING_AREA_CARD_CHANCES[1]
    const fitnessLevel = fitnessStudioLevels.get(team.id) ?? 0
    const fitnessOverrides = FITNESS_STUDIO_CARD_CHANCES[fitnessLevel] || FITNESS_STUDIO_CARD_CHANCES[0]
    const actionCards = []
    while (actionCards.length === 0) {
      for (const [action, defaultChance] of Object.entries(actionCardChances)) {
        // Override LEVEL_UP card chances based on training area level
        // Override FRESHNESS card chances based on fitness studio level
        let chance = defaultChance
        if (cardOverrides[action] !== undefined) chance = cardOverrides[action]
        if (fitnessOverrides[action] !== undefined) chance = fitnessOverrides[action]
        // For probabilities > 1, give floor(chance) guaranteed cards + remainder chance for one more
        const guaranteed = Math.floor(chance)
        const remainder = chance - guaranteed
        for (let i = 0; i < guaranteed; i++) {
          actionCards.push(new ActionCard({ team_id: team.id, action, played: 0, state: 'pending' }))
        }
        if (Math.random() < remainder) {
          actionCards.push(new ActionCard({ team_id: team.id, action, played: 0, state: 'pending' }))
        }
      }
    }
    for (const actionCard of actionCards) {
      promises.push(query('INSERT INTO action_card SET ?', actionCard))
    }
  }
  await Promise.all(promises)
  console.log(`Gave action cards in ${Date.now() - t1}ms.`)
}

/**
 * @param {TeamType} teamA
 * @param {TeamType} teamB
 * @param {number} strengthTeamA
 * @param {number} strengthTeamB
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<StadiumDetails>}
 */
async function _giveStadiumTicketEarnings (teamA, teamB, strengthTeamA, strengthTeamB, gameDay, season) {
  const strengthFactor = ((strengthTeamA || 0) * (strengthTeamB || 0)) / 100
  const [stadium] = await query('SELECT * FROM stadium WHERE team_id=?', [teamA.id])

  // If no stadium found, return empty details with no earnings
  if (!stadium) {
    console.warn(`No stadium found for team ${teamA.id}`)
    return {}
  }

  const stands = ['north', 'south', 'west', 'east']
  const details = {}
  let totalEarnings = 0
  let totalCapacity = 0
  for (const stand of stands) {
    const size = stadium[stand + '_stand_size'] || 0
    totalCapacity += size

    // Skip if stand is under construction (check for truthy value to handle missing columns)
    const constructionEndDay = stadium[`${stand}_construction_end_game_day`]
    if (constructionEndDay != null) {
      details[stand + 'Guests'] = 0
      details[stand + 'Earnings'] = 0
      details[stand + 'UnderConstruction'] = true
      continue
    }

    const price = stadium[stand + '_stand_price'] || 0

    // Skip if price is 0 to avoid division by zero
    if (price <= 0 || size <= 0) {
      details[stand + 'Guests'] = 0
      details[stand + 'Earnings'] = 0
      continue
    }

    const roofFactor = stadium[stand + '_stand_roof'] ? 1.2 : 1
    const priceFactor = 15 / price
    const amountOfGuests = Math.floor(Math.min(size, strengthFactor * priceFactor * roofFactor))
    details[stand + 'Guests'] = amountOfGuests
    const earnings = amountOfGuests * price
    details[stand + 'Earnings'] = earnings
    totalEarnings += earnings
  }

  details.totalCapacity = totalCapacity
  details.totalEarnings = totalEarnings

  // Final safety check - never pass NaN to balance update
  if (isNaN(totalEarnings)) {
    console.error(`NaN earnings detected for team ${teamA.id}, stadium:`, stadium)
    totalEarnings = 0
  }

  const locale = await getUserLocale(teamA.user_id)
  const reason = t('finance.stadiumTicketEarnings', {}, locale)
  await updateTeamBalance(teamA, totalEarnings, reason, gameDay, season)
  return details
}

/**
 * @param {GameType} game
 * @returns {Promise<void>}
 */
async function _playGame (game) {
  const [[teamA], [teamB], allPlayerTeamA, allPlayerTeamB] = await Promise.all([
    await query('SELECT * FROM team WHERE id=?', [game.team_1_id]),
    await query('SELECT * FROM team WHERE id=?', [game.team_2_id]),
    await query('SELECT * FROM player WHERE team_id=? AND in_game_position<>\'\' AND in_game_position IS NOT NULL', [game.team_1_id]),
    await query('SELECT * FROM player WHERE team_id=? AND in_game_position<>\'\' AND in_game_position IS NOT NULL', [game.team_2_id])
  ])

  // Filter out suspended players (they miss this game)
  const playerTeamA = allPlayerTeamA.filter(p => !p.is_suspended)
  const playerTeamB = allPlayerTeamB.filter(p => !p.is_suspended)

  // Clear suspensions for ALL players on both teams who served their ban (not just those in lineup)
  // This ensures benched players with suspensions also get cleared
  const clearedA = await query(
    'UPDATE player SET is_suspended=0, yellow_cards=0, red_cards=0 WHERE team_id=? AND is_suspended=1',
    [game.team_1_id]
  )
  const clearedB = await query(
    'UPDATE player SET is_suspended=0, yellow_cards=0, red_cards=0 WHERE team_id=? AND is_suspended=1',
    [game.team_2_id]
  )
  if (clearedA.affectedRows > 0 || clearedB.affectedRows > 0) {
    console.log(`Suspensions cleared: ${clearedA.affectedRows} for ${teamA.name}, ${clearedB.affectedRows} for ${teamB.name}`)
  }
  const strengthTeamA = playerTeamA.reduce((totalStrength, player) => totalStrength + player.level, 0)
  const strengthTeamB = playerTeamB.reduce((totalStrength, player) => totalStrength + player.level, 0)
  const stadiumDetails = await _giveStadiumTicketEarnings(teamA, teamB, strengthTeamA, strengthTeamB, game.game_day, game.season)
  console.log(`\n\nPlay game between ${teamA.name} (${strengthTeamA}) and ${teamB.name} (${strengthTeamB})`)
  const gameDetails = {
    log: [],
    goalsTeamB: 0,
    goalsTeamA: 0,
    strengthTeamA,
    strengthTeamB,
    stadiumDetails,
    playerTeamA,
    playerTeamB,
    teamA,
    teamB
  }
  for (const player of playerTeamA) {
    player.level = player.freshness * player.level
  }
  for (const player of playerTeamB) {
    player.level = player.freshness * player.level
  }
  kickoff(playerTeamA, playerTeamB, gameDetails)
  const overtime = Math.floor(Math.random() * 50)
  const totalSteps = 900 + overtime
  for (let step = 0; step < totalSteps; step++) {
    // Convert step to match minute (0-89 for regular time, 90+ for overtime)
    // Each 10 steps = 1 minute in regular time
    gameDetails.currentMinute = step < 900 ? Math.floor(step / 10) : 90 + Math.floor((step - 900) / 10)
    playGameStep(playerTeamA, playerTeamB, gameDetails)
  }
  delete gameDetails.currentMinute // Don't persist internal tracking field
  await query('UPDATE game SET details=?, played=1, goals_team_1=?, goals_team_2=?, created_at=? WHERE id=?', [
    JSON.stringify(gameDetails),
    gameDetails.goalsTeamA,
    gameDetails.goalsTeamB,
    new Date(),
    game.id
  ])

  // Update freshness and card counts for all players
  // Freshness loss depends on play style: aggressive 15%, normal 12%, friendly 10%
  // Goalkeepers always lose 8%
  const freshnessLossByStyle = {
    aggressive: 0.13,
    normal: 0.10,
    friendly: 0.08
  }
  for (const player of playerTeamA) {
    const playStyle = teamA.play_style || 'normal'
    const freshnessLoss = player.position === 'GK' ? 0.08 : freshnessLossByStyle[playStyle]
    player.freshness = Math.max(0, player.freshness - freshnessLoss)
    await _updatePlayerAfterGame(player, gameDetails, teamA)
  }
  for (const player of playerTeamB) {
    const playStyle = teamB.play_style || 'normal'
    const freshnessLoss = player.position === 'GK' ? 0.08 : freshnessLossByStyle[playStyle]
    player.freshness = Math.max(0, player.freshness - freshnessLoss)
    await _updatePlayerAfterGame(player, gameDetails, teamB)
  }
}

/**
 * Update player card counts and suspension status after a game
 * @param {GamePlayer} player
 * @param {GameDetails} gameDetails
 * @param {TeamType} team
 */
async function _updatePlayerAfterGame (player, gameDetails, team) {
  const yellowsInMatch = gameDetails.yellowCardsInMatch?.[player.id] || 0
  const sentOff = gameDetails.sentOffPlayerIds?.includes(player.id)

  // Get current card counts from database
  const [currentPlayer] = await query('SELECT yellow_cards, red_cards FROM player WHERE id=?', [player.id])
  let newRedCards = currentPlayer?.red_cards || 0
  let isSuspended = false

  // If sent off, don't persist the yellows from this match (they converted to a red)
  // Only add yellows if player was NOT sent off
  let newYellowCards = (currentPlayer?.yellow_cards || 0) + (sentOff ? 0 : yellowsInMatch)

  if (sentOff) {
    // Red card = suspended for next match
    newRedCards = 1
    isSuspended = true

    // Add log message for team owner
    if (team.user_id) {
      const locale = await getUserLocale(team.user_id)
      await addLogMessage(
        t('log.playerRedCard', { playerName: player.name }, locale),
        team,
        'OPEN_PLAYER',
        player.id,
        'square'
      )
      await addLogMessage(
        t('log.playerSuspended', { playerName: player.name }, locale),
        team,
        'OPEN_PLAYER',
        player.id,
        'ban'
      )
    }
  } else if (newYellowCards >= 5) {
    // 5 yellow cards = suspended for next match
    isSuspended = true

    if (team.user_id) {
      const locale = await getUserLocale(team.user_id)
      await addLogMessage(
        t('log.playerFiveYellows', { playerName: player.name }, locale),
        team,
        'OPEN_PLAYER',
        player.id,
        'exclamation-triangle'
      )
      await addLogMessage(
        t('log.playerSuspended', { playerName: player.name }, locale),
        team,
        'OPEN_PLAYER',
        player.id,
        'ban'
      )
    }
  } else if (yellowsInMatch > 0 && team.user_id) {
    // Log yellow card(s) for this match
    const locale = await getUserLocale(team.user_id)
    await addLogMessage(
      t('log.playerYellowCard', {
        playerName: player.name,
        count: yellowsInMatch
      }, locale),
      team,
      'OPEN_PLAYER',
      player.id,
      'square'
    )
  }

  // Update player in database
  await query(
    'UPDATE player SET freshness=?, yellow_cards=?, red_cards=?, is_suspended=? WHERE id=?',
    [player.freshness, newYellowCards, newRedCards, isSuspended ? 1 : 0, player.id]
  )
}

