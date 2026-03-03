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
import {
  completeBuildingConstructions,
  FITNESS_STUDIO_CARD_CHANCES,
  getAllFitnessStudioLevels,
  getAllTrainingAreaLevels,
  TRAINING_AREA_CARD_CHANCES
} from './helper/buildingHelper.js'
import { addLogMessage, checkTeamAndNotify } from './helper/logMessageHelper.js'
import { getUserLocale, t } from './i18n/index.js'
import { processYouthTraining } from './helper/youthPlayerHelper.js'
import { cacheStandingsForGameDay } from './helper/standingHelper.js'
import { cacheTeamStatsForGameDay } from './helper/teamStatsHelper.js'
import { cachePlayerStatsForGameDay } from './helper/playerStatsHelper.js'
import { CACHE_NAMESPACES, clearCacheByPrefix } from './lib/cache.js'
import { progressCupRound, sendCupMatchLogMessages, validateAndProgressCupRounds } from './helper/cupHelper.js'
import { getPositionsOfFormation } from '../client/util/formation.js'
import { kickoff, playGameStep } from './play-game.js'
import { sendGameDayPushNotifications } from './helper/pushNotificationHelper.js'

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

  // Reset motivating speech boosts after all games are played
  await _resetMotivatingSpeeches()

  // Clear season results cache after games are played
  clearCacheByPrefix(CACHE_NAMESPACES.SEASON_RESULTS)
  await cacheStandingsForGameDay(gameDay, season)
  await cachePlayerStatsForGameDay(gameDay, season)
  await cacheTeamStatsForGameDay(gameDay, season)
  await deleteExpiredPendingCards()
  await _giveUsersActionCards()
  await _letTeamsPaySallaries(gameDay, season)
  await _giveSponsorMoney(gameDay, season)
  await _giveAllPlayersFreshness(season)
  await _processYouthTeams()
  await generateNewsForGameDay(gameDay, season)
  await _checkUserTeamsForIssues()
  await sendGameDayPushNotifications(gameDay, season)
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
  await validateAndProgressCupRounds(season)
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
  let playerTeamA = allPlayerTeamA.filter(p => !p.is_suspended)
  let playerTeamB = allPlayerTeamB.filter(p => !p.is_suspended)

  // Auto-fill incomplete lineups before the game
  playerTeamA = await _autoFillLineup(teamA, playerTeamA)
  playerTeamB = await _autoFillLineup(teamB, playerTeamB)

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

  console.log(`\n\n🏆 Cup match: ${teamA.name} (${strengthTeamA}) vs ${teamB.name} (${strengthTeamB})`)

  // Calculate stadium earnings for cup games (team A is the home team)
  const stadiumDetails = await _giveStadiumTicketEarnings(teamA, teamB, strengthTeamA, strengthTeamB, game.game_day, game.season)

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
    teamB,
    isCup: true
  }

  for (const player of playerTeamA) {
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
  }
  for (const player of playerTeamB) {
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
  }
  // Apply motivating speech boost (+10% level for all players)
  if (teamA.motivating_speech_active) {
    for (const player of playerTeamA) {
      player.level *= 1.1
    }
  }
  if (teamB.motivating_speech_active) {
    for (const player of playerTeamB) {
      player.level *= 1.1
    }
  }

  kickoff(playerTeamA, playerTeamB, gameDetails)
  const overtime = Math.floor(Math.random() * 50)
  const totalSteps = 900 + overtime
  for (let step = 0; step < totalSteps; step++) {
    // Convert step to match minute (0-89 for regular time, 90+ for overtime)
    gameDetails.currentMinute = step < 900 ? Math.floor(step / 10) : 90 + Math.floor((step - 900) / 10)
    playGameStep(playerTeamA, playerTeamB, gameDetails)
  }

  // Cup games cannot end in a draw — play extra time until someone scores
  if (gameDetails.goalsTeamA === gameDetails.goalsTeamB) {
    gameDetails.extraTime = true
    console.log(`Cup match is a draw after regular time (${gameDetails.goalsTeamA}-${gameDetails.goalsTeamB}), playing extra time...`)
    const maxExtraSteps = 9000 // Safety limit (~15 hours of match time)
    let extraStep = 0
    while (gameDetails.goalsTeamA === gameDetails.goalsTeamB && extraStep < maxExtraSteps) {
      gameDetails.currentMinute = 91 + Math.floor(extraStep / 10)
      playGameStep(playerTeamA, playerTeamB, gameDetails)
      extraStep++
    }
    // If still tied after max extra steps, award to home team
    if (gameDetails.goalsTeamA === gameDetails.goalsTeamB) {
      gameDetails.goalsTeamA++
      console.log('Cup extra time: no goal scored, awarding to home team')
    } else {
      console.log(`Cup extra time decided after ${Math.floor(extraStep / 10)} extra minutes: ${gameDetails.goalsTeamA}-${gameDetails.goalsTeamB}`)
    }
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
    aggressive: 0.12,
    normal: 0.1,
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
  const teams = await query('SELECT * FROM team WHERE is_system_team = 0')
  await Promise.all(teams.map(team => processYouthTraining(team)))
  console.log(`Processed youth teams in ${Date.now() - t1}ms`)
}

/**
 * Reset motivating speech boosts after games are played
 * @returns {Promise<void>}
 */
async function _resetMotivatingSpeeches () {
  const result = await query('UPDATE team SET motivating_speech_active=0 WHERE motivating_speech_active=1')
  if (result.affectedRows > 0) {
    console.log(`Reset motivating speech for ${result.affectedRows} teams`)
  }
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
    const recovery = _calculateFreshnessRecovery(await getPlayerAge(player, season), !!player.in_game_position)
    player.freshness = Math.min(1.0, player.freshness + recovery)
    promises.push(query('UPDATE player SET freshness=? WHERE id=?', [player.freshness, player.id]))
  }
  await Promise.all(promises)
}

/**
 * Calculate freshness recovery for a player based on age and whether they played.
 * Applies +-20% randomness to the result.
 * @param {number} age
 * @param {boolean} isInLineup - whether the player is in the lineup (has in_game_position)
 * @returns {number}
 */
export function _calculateFreshnessRecovery (age, isInLineup) {
  let baseRecovery
  if (age <= 21) {
    baseRecovery = 0.10
  } else if (age <= 26) {
    baseRecovery = 0.08
  } else if (age <= 29) {
    baseRecovery = 0.06
  } else if (age <= 32) {
    baseRecovery = 0.05
  } else {
    baseRecovery = 0.04
  }

  // Players not in lineup recover significantly more
  if (!isInLineup) {
    baseRecovery += 0.08
  }

  // Apply +-20% randomness
  const randomFactor = 0.8 + Math.random() * 0.4 // 0.8 to 1.2
  return baseRecovery * randomFactor
}

/**
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
async function _giveSponsorMoney (gameDay, season) {
  const t1 = Date.now()
  /** @type {Array<import('./entities/team.js').TeamType>} */
  const teams = await query('SELECT * FROM team WHERE is_system_team = 0')

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
  const teams = await query('SELECT * FROM team WHERE is_system_team = 0')
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
  const teams = await query('SELECT * FROM team WHERE is_system_team = 0')
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
          actionCards.push(new ActionCard({
            team_id: team.id,
            action,
            played: 0,
            state: 'pending'
          }))
        }
        if (Math.random() < remainder) {
          actionCards.push(new ActionCard({
            team_id: team.id,
            action,
            played: 0,
            state: 'pending'
          }))
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
    const priceFactor = (15 / price) ** 2
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
 * Auto-fill incomplete lineup for a team before a game.
 * Finds missing positions and assigns random matching bench players.
 * @param {TeamType} team
 * @param {PlayerType[]} lineupPlayers - players currently in the lineup (non-suspended)
 * @returns {Promise<PlayerType[]>} updated lineup players
 */
async function _autoFillLineup (team, lineupPlayers) {
  const requiredPositions = getPositionsOfFormation(team.formation)
  if (!requiredPositions) return lineupPlayers

  // Count filled positions
  const filledPositions = lineupPlayers.map(p => p.in_game_position)

  // Find missing positions: for each required position, remove one matching filled position
  const remainingFilled = [...filledPositions]
  const missingPositions = []
  for (const pos of requiredPositions) {
    const idx = remainingFilled.indexOf(pos)
    if (idx !== -1) {
      remainingFilled.splice(idx, 1)
    } else {
      missingPositions.push(pos)
    }
  }

  if (missingPositions.length === 0) return lineupPlayers

  // Get all bench players (not in lineup, not suspended)
  const benchPlayers = await query(
    'SELECT * FROM player WHERE team_id=? AND (in_game_position=\'\' OR in_game_position IS NULL) AND is_suspended=0',
    [team.id]
  )

  const locale = team.user_id ? await getUserLocale(team.user_id) : 'en'
  const addedPlayers = []

  for (const position of missingPositions) {
    // Try to find a bench player whose natural position matches
    let candidates = benchPlayers.filter(p =>
      p.position === position && !addedPlayers.includes(p.id)
    )

    // If no exact match, try any remaining bench player not yet assigned
    if (candidates.length === 0) {
      candidates = benchPlayers.filter(p => !addedPlayers.includes(p.id))
    }

    if (candidates.length === 0) break

    const chosen = candidates[Math.floor(Math.random() * candidates.length)]
    chosen.in_game_position = position
    addedPlayers.push(chosen.id)

    await query('UPDATE player SET in_game_position=? WHERE id=?', [position, chosen.id])

    if (team.user_id) {
      await addLogMessage(
        t('log.lineupAutoFilled', { playerName: chosen.name, position }, locale),
        team,
        'OPEN_MY_TEAM_PAGE',
        null,
        'users'
      )
    }

    lineupPlayers.push(chosen)
  }

  return lineupPlayers
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
  let playerTeamA = allPlayerTeamA.filter(p => !p.is_suspended)
  let playerTeamB = allPlayerTeamB.filter(p => !p.is_suspended)

  // Auto-fill incomplete lineups before the game
  playerTeamA = await _autoFillLineup(teamA, playerTeamA)
  playerTeamB = await _autoFillLineup(teamB, playerTeamB)

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
    console.log(`🛑 Suspensions cleared: ${clearedA.affectedRows} for ${teamA.name}, ${clearedB.affectedRows} for ${teamB.name}`)
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
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
  }
  for (const player of playerTeamB) {
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
  }
  // Apply motivating speech boost (+10% level for all players)
  if (teamA.motivating_speech_active) {
    for (const player of playerTeamA) {
      player.level *= 1.1
    }
  }
  if (teamB.motivating_speech_active) {
    for (const player of playerTeamB) {
      player.level *= 1.1
    }
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
    aggressive: 0.12,
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

