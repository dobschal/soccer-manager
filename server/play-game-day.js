import { query } from './lib/database.js'
import { determineOponentPosition } from '../client/util/formation.js'
import { randomItem } from './lib/util.js'
import { ActionCard } from './entities/actionCard.js'
import { getSponsor } from './helper/sponsorHelper.js'
import { updateTeamBalance } from './helper/financeHelper.js'
import { sallaryPerLevel } from '../client/util/player.js'
import { getGameDayAndSeason } from './helper/gameDayHelper.js'
import { getPlayerAge } from './helper/playerHelper.js'
import { actionCardChances } from './helper/actionCardHelper.js'
import { generateNewsForGameDay } from './helper/newsHelper.js'
import { completeStadiumConstructions } from './helper/stadiumHelper.js'
import { checkTeamAndNotify } from './helper/logMessageHelper.js'
import { getUserLocale, t } from './i18n/index.js'
import { processYouthTraining } from './helper/youthPlayerHelper.js'
import { addLogMessage } from './helper/logMessageHelper.js'
import { cacheStandingsForGameDay } from './helper/standingHelper.js'
import { cachePlayerStatsForGameDay } from './helper/playerStatsHelper.js'
import { clearCacheByPrefix, CACHE_NAMESPACES } from './lib/cache.js'
import { progressCupRound, sendCupMatchLogMessages, getCupRoundsForSeason } from './helper/cupHelper.js'

/**
 * @typedef {object} KickoffLogEvent
 * @property {number} player
 * @property {true} kickoff
 */

/**
 * @typedef {object} PassLogEvent
 * @property {true} pass
 * @property {number} newPlayer
 * @property {number} oldPlayer
 */

/**
 * @typedef {object} FightLogEvent
 * @property {number} player
 * @property {number} oponentPlayer
 * @property {boolean} lostBall
 */

/**
 * @typedef {object} KeeperHoldsLogEvent
 * @property {number} player
 * @property {true} keeperHolds
 * @property {number} goalKeeper
 */

/**
 * @typedef {object} GoalLogEvent
 * @property {true} goal
 * @property {number} player
 */

/**
 * @typedef {object} YellowCardLogEvent
 * @property {true} yellowCard
 * @property {number} player
 */

/**
 * @typedef {object} RedCardLogEvent
 * @property {true} redCard
 * @property {number} player
 * @property {boolean} [secondYellow] - True if red card from second yellow
 */

/**
 * @typedef {KickoffLogEvent | PassLogEvent | FightLogEvent | KeeperHoldsLogEvent | GoalLogEvent | YellowCardLogEvent | RedCardLogEvent} GameLogEvent
 */

/**
 * @typedef {object} StadiumDetails
 * @property {number} northGuests
 * @property {number} northEarnings
 * @property {number} southGuests
 * @property {number} southEarnings
 * @property {number} westGuests
 * @property {number} westEarnings
 * @property {number} eastGuests
 * @property {number} eastEarnings
 */

/**
 * @typedef {PlayerType & { hasBall?: boolean, yellowCardsInMatch?: number, sentOff?: boolean }} GamePlayer
 */

/**
 * @typedef {object} GameDetails
 * @property {GameLogEvent[]} log
 * @property {number} goalsTeamA
 * @property {number} goalsTeamB
 * @property {number} strengthTeamA
 * @property {number} strengthTeamB
 * @property {StadiumDetails} stadiumDetails
 * @property {GamePlayer[]} playerTeamA
 * @property {GamePlayer[]} playerTeamB
 * @property {TeamType} teamA
 * @property {TeamType} teamB
 * @property {number} [streak]
 * @property {Object<number, number>} [yellowCardsInMatch] - Yellow cards by player id during this match
 * @property {number[]} [sentOffPlayerIds] - Player IDs sent off during this match
 */

/**
 * Play style modifiers for fight chance and card chance
 * Target yellow cards per game: aggressive 4.0, normal 3.5, friendly 3.0
 * Target red cards per game: aggressive 0.13, normal 0.1, friendly 0.07
 * @type {Object<string, {fightBonus: number, cardChance: number}>}
 */
const PLAY_STYLE_MODIFIERS = {
  aggressive: { fightBonus: 0.15, cardChance: 0.005 },
  normal: { fightBonus: 0, cardChance: 0.004 },
  friendly: { fightBonus: -0.15, cardChance: 0.003 }
}

/**
 * Position coordinates for calculating pass distances
 * @type {Object<string, {x: number, y: number}>}
 */
const POSITION_COORDS = {
  GK: {
    x: 1,
    y: 0
  },
  LD: {
    x: 0,
    y: 1
  },
  CD: {
    x: 1,
    y: 1
  },
  RD: {
    x: 2,
    y: 1
  },
  DM: {
    x: 1,
    y: 1.5
  },
  LM: {
    x: 0,
    y: 2
  },
  CM: {
    x: 1,
    y: 2
  },
  RM: {
    x: 2,
    y: 2
  },
  OM: {
    x: 1,
    y: 2.5
  },
  LA: {
    x: 0,
    y: 3
  },
  CA: {
    x: 1,
    y: 3
  },
  RA: {
    x: 2,
    y: 3
  }
}

/**
 * Calculate the distance between two positions
 * @param {string} pos1
 * @param {string} pos2
 * @returns {number}
 */
function _getPositionDistance (pos1, pos2) {
  const coord1 = POSITION_COORDS[pos1]
  const coord2 = POSITION_COORDS[pos2]
  if (!coord1 || !coord2) return 1
  return Math.sqrt(Math.pow(coord2.x - coord1.x, 2) + Math.pow(coord2.y - coord1.y, 2))
}

/**
 * @returns {Promise<void>}
 */
export async function calculateGames () {
  const {
    gameDay,
    season
  } = await getGameDayAndSeason()
  console.log(`Calculate games for season ${season} game day ${gameDay}`)

  // Complete any stadium constructions that are due
  await completeStadiumConstructions(gameDay, season)

  // Play league games
  const leagueGames = await query(
    "SELECT * FROM game WHERE season=? AND game_day=? AND played=0 AND (game_type='league' OR game_type IS NULL)",
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
    "SELECT * FROM game WHERE season=? AND game_day=? AND played=0 AND game_type='cup'",
    [season, gameDay]
  )

  if (cupGames.length === 0) {
    return console.log('No cup games to play on this game day')
  }

  console.log(`Playing ${cupGames.length} cup games...`)

  for (const game of cupGames) {
    await _playCupGame(game)
  }

  // Check if any rounds are complete and progress them
  const rounds = await getCupRoundsForSeason(season)
  for (const round of rounds) {
    if (round.played) continue

    // Check if all games in this round are now played
    const unplayedInRound = await query(
      "SELECT * FROM game WHERE game_type='cup' AND season=? AND cup_round=? AND played=0",
      [season, round.round]
    )

    if (unplayedInRound.length === 0) {
      const result = await progressCupRound(season, round.round)
      if (result.isComplete) {
        console.log('🏆 Cup is complete!')
      } else if (result.advanced) {
        console.log(`Cup round ${round.round} complete, advanced to next round`)
      }
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

  _kickoff(playerTeamA, playerTeamB, gameDetails)
  const overtime = Math.floor(Math.random() * 50)
  const totalSteps = 900 + overtime
  for (let step = 0; step < totalSteps; step++) {
    // Convert step to match minute (0-89 for regular time, 90+ for overtime)
    gameDetails.currentMinute = step < 900 ? Math.floor(step / 10) : 90 + Math.floor((step - 900) / 10)
    _playGameStep(playerTeamA, playerTeamB, gameDetails)
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
  const freshnessLossByStyle = { aggressive: 0.15, normal: 0.12, friendly: 0.10 }
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
    const { sponsor } = await getSponsor(team, { gameDay, season })
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
    const totalSallaryCosts = players.reduce((total, player) => total + sallaryPerLevel[player.level], 0) * -1
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
  const promises = []
  for (const team of teams) {
    const actionCards = []
    while (actionCards.length === 0) {
      if (Math.random() < actionCardChances.LEVEL_UP_PLAYER_10) {
        actionCards.push(new ActionCard({
          team_id: team.id,
          action: 'LEVEL_UP_PLAYER_10',
          played: 0
        }))
      }
      if (Math.random() < actionCardChances.LEVEL_UP_PLAYER_7) {
        actionCards.push(new ActionCard({
          team_id: team.id,
          action: 'LEVEL_UP_PLAYER_7',
          played: 0
        }))
      }
      if (Math.random() < actionCardChances.LEVEL_UP_PLAYER_4) {
        actionCards.push(new ActionCard({
          team_id: team.id,
          action: 'LEVEL_UP_PLAYER_4',
          played: 0
        }))
      }
      if (Math.random() < actionCardChances.CHANGE_PLAYER_POSITION) {
        actionCards.push(new ActionCard({
          team_id: team.id,
          action: 'CHANGE_PLAYER_POSITION',
          played: 0
        }))
      }
      if (Math.random() < actionCardChances.NEW_YOUTH_PLAYER) {
        actionCards.push(new ActionCard({
          team_id: team.id,
          action: 'NEW_YOUTH_PLAYER',
          played: 0
        }))
      }
      if (Math.random() < actionCardChances.FRESHNESS_10) {
        actionCards.push(new ActionCard({
          team_id: team.id,
          action: 'FRESHNESS_10',
          played: 0
        }))
      }
      if (Math.random() < actionCardChances.BONUS_100K) {
        actionCards.push(new ActionCard({
          team_id: team.id,
          action: 'BONUS_100K',
          played: 0
        }))
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
  const strengthFactor = (strengthTeamA || 0) * (strengthTeamB || 0)
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
  _kickoff(playerTeamA, playerTeamB, gameDetails)
  const overtime = Math.floor(Math.random() * 50)
  const totalSteps = 900 + overtime
  for (let step = 0; step < totalSteps; step++) {
    // Convert step to match minute (0-89 for regular time, 90+ for overtime)
    // Each 10 steps = 1 minute in regular time
    gameDetails.currentMinute = step < 900 ? Math.floor(step / 10) : 90 + Math.floor((step - 900) / 10)
    _playGameStep(playerTeamA, playerTeamB, gameDetails)
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
  const freshnessLossByStyle = { aggressive: 0.15, normal: 0.12, friendly: 0.10 }
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
      t('log.playerYellowCard', { playerName: player.name, count: yellowsInMatch }, locale),
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

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 * @returns {void}
 */
function _kickoff (playerTeamA, playerTeamB, gameDetails) {
  const player = randomItem(playerTeamA.concat(playerTeamB))
  player.hasBall = true
  console.log('Kickoff thru: ', player.name)
  gameDetails.log.push({
    player: player.id,
    kickoff: true
  })
}

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 * @returns {void}
 */
function _playGameStep (playerTeamA, playerTeamB, gameDetails) {
  if (!_fightsOpponents(playerTeamA, playerTeamB, gameDetails)) return
  if (!_shootBall(playerTeamA, playerTeamB, gameDetails)) return
  _passBall(playerTeamA, playerTeamB, gameDetails)
}

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 * @returns {boolean} false if lost ball
 */
function _fightsOpponents (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall && !p.sentOff)
  gameDetails.streak = gameDetails.streak ?? 0
  gameDetails.yellowCardsInMatch = gameDetails.yellowCardsInMatch ?? {}
  gameDetails.sentOffPlayerIds = gameDetails.sentOffPlayerIds ?? []
  let teamAHasBall = true
  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall && !p.sentOff)
    teamAHasBall = false
  }

  // If player was sent off, pass ball to teammate
  if (!activePlayer) {
    const teamWithBall = teamAHasBall ? playerTeamA : playerTeamB
    const availablePlayers = teamWithBall.filter(p => !p.sentOff)
    if (availablePlayers.length > 0) {
      activePlayer = randomItem(availablePlayers)
      activePlayer.hasBall = true
    } else {
      return true // No players available
    }
  }

  if (Math.random() > _chanceToFight(activePlayer)) {
    return true
  }

  const oponentPosition = determineOponentPosition(activePlayer.position)
  const defendingTeam = teamAHasBall ? playerTeamB : playerTeamA
  const oponentPlayers = defendingTeam.filter(p => p.position === oponentPosition && !p.sentOff)

  if (oponentPlayers.length === 0) {
    console.log(`${activePlayer.name} has no oponents`)
    return true
  }

  const defendingTeamObj = teamAHasBall ? gameDetails.teamB : gameDetails.teamA
  const attackingTeamObj = teamAHasBall ? gameDetails.teamA : gameDetails.teamB
  const defendingPlayStyle = defendingTeamObj.play_style || 'normal'
  const attackingPlayStyle = attackingTeamObj.play_style || 'normal'

  for (const oponentPlayer of oponentPlayers) {
    // Apply play style modifiers to fight chance
    const defendingModifier = PLAY_STYLE_MODIFIERS[defendingPlayStyle] || PLAY_STYLE_MODIFIERS.normal
    const attackingModifier = PLAY_STYLE_MODIFIERS[attackingPlayStyle] || PLAY_STYLE_MODIFIERS.normal

    // Defender's bonus helps them win the ball
    const effectiveDefenderLevel = oponentPlayer.level * (1 + defendingModifier.fightBonus)
    // Attacker's bonus helps them keep the ball
    const effectiveAttackerLevel = activePlayer.level * (1 + attackingModifier.fightBonus)

    const chanceToLooseBall = effectiveAttackerLevel / (effectiveDefenderLevel + effectiveAttackerLevel)
    const looseBall = Math.random() > chanceToLooseBall

    // Check for cards during the fight (defender has card chance based on their play style)
    _checkForCard(oponentPlayer, defendingPlayStyle, gameDetails, defendingTeam)
    _checkForCard(activePlayer, attackingPlayStyle, gameDetails, teamAHasBall ? playerTeamA : playerTeamB)

    gameDetails.log.push({
      player: activePlayer.id,
      oponentPlayer: oponentPlayer.id,
      lostBall: looseBall
    })

    if (!looseBall) {
      gameDetails.streak++
      if (gameDetails.streak > 10) {
        console.log('Streak!!!', gameDetails.streak)
      }
    } else {
      gameDetails.streak = 0
      // If the opponent was sent off during this fight, ball goes to random teammate
      if (oponentPlayer.sentOff) {
        const availableDefenders = defendingTeam.filter(p => !p.sentOff)
        if (availableDefenders.length > 0) {
          const newPlayer = randomItem(availableDefenders)
          newPlayer.hasBall = true
        }
      } else {
        oponentPlayer.hasBall = true
      }
      activePlayer.hasBall = false
      return false
    }
  }
  return true
}

/**
 * Check if a player receives a card during a fight
 * @param {GamePlayer} player
 * @param {string} playStyle
 * @param {GameDetails} gameDetails
 * @param {GamePlayer[]} team
 */
function _checkForCard (player, playStyle, gameDetails, team) {
  if (player.sentOff) return

  const modifier = PLAY_STYLE_MODIFIERS[playStyle] || PLAY_STYLE_MODIFIERS.normal

  // Check for yellow card
  if (Math.random() < modifier.cardChance) {
    player.yellowCardsInMatch = (player.yellowCardsInMatch || 0) + 1
    gameDetails.yellowCardsInMatch[player.id] = player.yellowCardsInMatch

    if (player.yellowCardsInMatch >= 2) {
      // Second yellow = red card
      player.sentOff = true
      gameDetails.sentOffPlayerIds.push(player.id)
      gameDetails.log.push({
        redCard: true,
        player: player.id,
        secondYellow: true,
        minute: gameDetails.currentMinute
      })
      console.log(`RED CARD (2nd yellow): ${player.name}`)

      // If player had ball, give to teammate
      if (player.hasBall) {
        player.hasBall = false
        const availablePlayers = team.filter(p => !p.sentOff && p.id !== player.id)
        if (availablePlayers.length > 0) {
          randomItem(availablePlayers).hasBall = true
        }
      }
    } else {
      gameDetails.log.push({
        yellowCard: true,
        player: player.id,
        minute: gameDetails.currentMinute
      })
      console.log(`YELLOW CARD: ${player.name}`)
    }
  }

  // Small chance for direct red card (very aggressive play)
  if (playStyle === 'aggressive' && Math.random() < 0.0001 && !player.sentOff) {
    player.sentOff = true
    gameDetails.sentOffPlayerIds.push(player.id)
    gameDetails.log.push({
      redCard: true,
      player: player.id,
      minute: gameDetails.currentMinute
    })
    console.log(`DIRECT RED CARD: ${player.name}`)

    // If player had ball, give to teammate
    if (player.hasBall) {
      player.hasBall = false
      const availablePlayers = team.filter(p => !p.sentOff && p.id !== player.id)
      if (availablePlayers.length > 0) {
        randomItem(availablePlayers).hasBall = true
      }
    }
  }
}

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 * @returns {boolean} false if lost ball
 */
function _shootBall (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall)
  let goalKeeper = playerTeamB.find(p => p.position === 'GK')
  gameDetails.streak = gameDetails.streak ?? 0
  let teamAHasBall = true
  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall)
    goalKeeper = playerTeamA.find(p => p.position === 'GK')
    teamAHasBall = false
  }
  // Base chance + streak bonus (allows shots even at streak 0)
  const chanceForShoot = Math.min(0.95, _chanceToShoot(activePlayer, gameDetails) * (1 + gameDetails.streak * 0.3))
  if (Math.random() > chanceForShoot) return true

  // Shot is on target ~24% of the time (for ~12% conversion with 50% keeper save)
  const shotOnTarget = Math.random() < 0.24

  if (!shotOnTarget) {
    // Shot misses the target entirely
    return true
  }

  if (!goalKeeper) {
    console.log('Team has no goalkeeper set!')
  }

  // Shot on target - check if keeper saves
  const keeperSaves = goalKeeper && Math.random() < goalKeeper.level / (goalKeeper.level + activePlayer.level)

  if (keeperSaves) {
    gameDetails.log.push({
      player: activePlayer.id,
      keeperHolds: true,
      goalKeeper: goalKeeper.id
    })
    goalKeeper.hasBall = true
    activePlayer.hasBall = false
    return false
  }

  // GOAL!
  if (teamAHasBall) {
    gameDetails.goalsTeamA = gameDetails.goalsTeamA ?? 0
    gameDetails.goalsTeamA++
  } else {
    gameDetails.goalsTeamB = gameDetails.goalsTeamB ?? 0
    gameDetails.goalsTeamB++
  }
  console.log('GOAL!', gameDetails.goalsTeamA ?? 0, gameDetails.goalsTeamB ?? 0, 'streak: ' + gameDetails.streak, 'player level: ' + activePlayer.level, 'GK level: ' + (goalKeeper?.level ?? 0), 'shoot chance: ' + chanceForShoot)
  gameDetails.log.push({
    goal: true,
    player: activePlayer.id,
    minute: gameDetails.currentMinute,
    teamA: teamAHasBall
  })
  return true
}

/**
 * Base chance to attempt a shot per game step
 * Tuned to match Bundesliga stats: ~13 shots/team, ~3.16 goals/game
 * @param {PlayerType} player
 * @returns {number}
 */
function _chanceToShoot (player) {
  if (player.position.endsWith('A')) return 0.095
  if (player.position.endsWith('M')) return 0.04
  if (player.position.endsWith('D')) return 0.004
  return 0.00005
}

/**
 * @param {PlayerType} player
 * @returns {number}
 */
function _chanceToFight (player) {
  if (player.position.endsWith('A')) return 0.75
  if (player.position.endsWith('M')) return 0.5
  if (player.position.endsWith('D')) return 0.1
  return 0.01
}

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 * @returns {void}
 */
function _passBall (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall)
  let teamAHasBall = true
  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall)
    teamAHasBall = false
  }

  const teammates = teamAHasBall
    ? playerTeamA.filter(p => p.id !== activePlayer.id)
    : playerTeamB.filter(p => p.id !== activePlayer.id)

  const team = teamAHasBall ? gameDetails.teamA : gameDetails.teamB
  const passStyle = team.pass_style || 'mixed'

  const nextPlayer = _selectPassTarget(activePlayer, teammates, passStyle)

  activePlayer.hasBall = false
  nextPlayer.hasBall = true
  gameDetails.log.push({
    pass: true,
    newPlayer: nextPlayer.id,
    oldPlayer: activePlayer.id
  })
}

/**
 * Select the next player to pass to based on pass style
 * @param {GamePlayer} activePlayer
 * @param {GamePlayer[]} teammates
 * @param {string} passStyle - 'short', 'mixed', or 'long'
 * @returns {GamePlayer}
 */
function _selectPassTarget (activePlayer, teammates, passStyle) {
  if (teammates.length === 0) return activePlayer

  // Calculate distances to all teammates
  const teammatesWithDistance = teammates.map(player => ({
    player,
    distance: _getPositionDistance(activePlayer.in_game_position, player.in_game_position)
  }))

  // Sort by distance
  teammatesWithDistance.sort((a, b) => a.distance - b.distance)

  // Determine the threshold for short vs long (median distance)
  const medianIndex = Math.floor(teammatesWithDistance.length / 2)
  const shortPassTargets = teammatesWithDistance.slice(0, Math.max(1, medianIndex + 1))
  const longPassTargets = teammatesWithDistance.slice(Math.max(1, medianIndex))

  if (passStyle === 'short') {
    // Always pick from nearby players
    return randomItem(shortPassTargets).player
  } else if (passStyle === 'long') {
    // Always pick from far players
    return randomItem(longPassTargets).player
  } else {
    // Mixed: 50% chance for short, 50% for long
    if (Math.random() < 0.5) {
      return randomItem(shortPassTargets).player
    } else {
      return randomItem(longPassTargets).player
    }
  }
}
