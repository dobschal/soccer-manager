import { query } from './lib/database.js'
import { ActionCard } from './entities/actionCard.js'
import { getSponsor } from './helper/sponsorHelper.js'
import { updateTeamBalance } from './helper/financeHelper.js'
import { getSalary } from '../client/util/player.js'
import { getGameDayAndSeason } from './helper/gameDayHelper.js'
import { getPlayerAge } from './helper/playerHelper.js'
import { actionCardChances, deleteExpiredPendingCards } from './helper/actionCardHelper.js'
import { generateNewsForGameDay } from './helper/newsHelper.js'
import { completeStadiumConstructions, calculateHomeAttendanceBonus } from './helper/stadiumHelper.js'
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
import { recordCupWinnerForSeason, recordLeagueChampionsForSeason } from './helper/seasonTitleHelper.js'
import { kickoff, playGameStep } from './play-game.js'
import { sendGameDayPushNotifications } from './helper/pushNotificationHelper.js'
import { getCaptainStrengthMultiplier } from './helper/captainHelper.js'
import { autoFillLineup, trimExcessLineup } from './helper/lineupHelper.js'

/**
 * @param {object} [options]
 * @param {boolean} [options.skipPushNotifications] - Skip sending push notifications (e.g. when triggered locally)
 * @returns {Promise<void>}
 */
export async function calculateGames ({ skipPushNotifications = false } = {}) {
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
  await recordLeagueChampionsForSeason(season)
  await recordCupWinnerForSeason(season)
  await cachePlayerStatsForGameDay(gameDay, season)
  await cacheTeamStatsForGameDay(gameDay, season)
  await deleteExpiredPendingCards()
  await _giveUsersActionCards()
  await _letTeamsPaySallaries(gameDay, season)
  await _giveSponsorMoney(gameDay, season)
  await _recoverInjuredPlayers()
  await _giveAllPlayersFreshness(season)
  await _processYouthTeams()
  await generateNewsForGameDay(gameDay, season)
  await _checkUserTeamsForIssues()
  if (!skipPushNotifications) {
    await sendGameDayPushNotifications(gameDay, season)
  }
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

  // Filter out suspended and injured players (they miss this game)
  let playerTeamA = allPlayerTeamA.filter(p => !p.is_suspended && !p.is_injured)
  let playerTeamB = allPlayerTeamB.filter(p => !p.is_suspended && !p.is_injured)

  // Trim excess players and auto-fill incomplete lineups before the game
  playerTeamA = await trimExcessLineup(teamA, playerTeamA)
  playerTeamB = await trimExcessLineup(teamB, playerTeamB)
  playerTeamA = await autoFillLineup(teamA, playerTeamA)
  playerTeamB = await autoFillLineup(teamB, playerTeamB)

  // If either side can't field anyone (e.g. inherited bot team emptied via
  // transfers before a user took over), forfeit instead of crashing later
  // in playGameStep. Cup needs a winner, so award 3:0 to the present team.
  if (playerTeamA.length === 0 || playerTeamB.length === 0) {
    return _forfeitGame(game, teamA, teamB, playerTeamA.length, playerTeamB.length, 'cup')
  }

  // Remove lineup players from bench (they can't be in both)
  await _clearBenchForLineupPlayers(playerTeamA)
  await _clearBenchForLineupPlayers(playerTeamB)

  // Load bench players
  const benchTeamA = await _loadBenchPlayers(game.team_1_id)
  const benchTeamB = await _loadBenchPlayers(game.team_2_id)

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
    isCup: true,
    benchTeamA,
    benchTeamB
  }

  // Store original freshness and level before modification
  for (const player of [...playerTeamA, ...playerTeamB]) {
    player.originalFreshness = player.freshness
    player.originalLevel = player.level
    player.enterMinute = 0
  }
  for (const player of playerTeamA) {
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
    // Players playing out of their natural position are only half as effective
    if (player.position !== player.in_game_position) {
      player.level *= 0.5
    }
  }
  for (const player of playerTeamB) {
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
    // Players playing out of their natural position are only half as effective
    if (player.position !== player.in_game_position) {
      player.level *= 0.5
    }
  }
  // Apply level modifiers to bench players too
  _applyLevelModifiersToBench(benchTeamA, teamA, game.season, playerTeamA)
  _applyLevelModifiersToBench(benchTeamB, teamB, game.season, playerTeamB)
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
  // Apply captain strength modifier
  const cupCaptainMultiplierA = getCaptainStrengthMultiplier(teamA, playerTeamA, game.season)
  const cupCaptainMultiplierB = getCaptainStrengthMultiplier(teamB, playerTeamB, game.season)
  for (const player of playerTeamA) {
    player.level *= cupCaptainMultiplierA
  }
  for (const player of playerTeamB) {
    player.level *= cupCaptainMultiplierB
  }
  // Bot teams play 10% weaker to give human players an advantage
  if (!teamA.user_id) {
    for (const player of playerTeamA) {
      player.level *= 0.9
    }
  }
  if (!teamB.user_id) {
    for (const player of playerTeamB) {
      player.level *= 0.9
    }
  }
  // Apply home-team attendance bonus / empty-stadium malus to teamA (the home side)
  const cupHomeBonusMultiplier = stadiumDetails?.homeBonusMultiplier ?? 1
  if (cupHomeBonusMultiplier !== 1) {
    for (const player of playerTeamA) {
      player.level *= cupHomeBonusMultiplier
    }
  }
  // Store effective strength after all modifiers for display
  gameDetails.effectiveStrengthTeamA = Math.round(playerTeamA.reduce((sum, p) => sum + p.level, 0))
  gameDetails.effectiveStrengthTeamB = Math.round(playerTeamB.reduce((sum, p) => sum + p.level, 0))

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
  const cupTotalMinutes = (gameDetails.currentMinute ?? 89) + 1
  gameDetails.totalMinutes = cupTotalMinutes
  delete gameDetails.currentMinute // Don't persist internal tracking field

  // Persist injuries to database and send log messages
  await _persistInjuries(gameDetails, teamA, teamB)

  await query('UPDATE game SET details=?, played=1, goals_team_1=?, goals_team_2=?, created_at=? WHERE id=?', [
    JSON.stringify(gameDetails),
    gameDetails.goalsTeamA,
    gameDetails.goalsTeamB,
    new Date(),
    game.id
  ])

  for (const player of playerTeamA) {
    _applyFreshnessLoss(player, teamA, cupTotalMinutes)
    await _updatePlayerAfterGame(player, gameDetails, teamA)
  }
  for (const player of playerTeamB) {
    _applyFreshnessLoss(player, teamB, cupTotalMinutes)
    await _updatePlayerAfterGame(player, gameDetails, teamB)
  }

  // Send log messages to team owners about the cup match result
  await sendCupMatchLogMessages(game, gameDetails)
}

/**
 * Apply freshness loss scaled by the share of the match a player was on the pitch.
 * Substitutes who came on later, and players who left early (substituted out, sent off,
 * injured-and-replaced) lose proportionally less.
 *
 * @param {GamePlayer} player
 * @param {TeamType} team
 * @param {number} totalMinutes
 */
function _applyFreshnessLoss (player, team, totalMinutes) {
  const freshnessLossByStyle = {
    aggressive: 0.12,
    normal: 0.1,
    friendly: 0.08
  }
  const playStyle = team.play_style || 'normal'
  const baseLoss = player.position === 'GK' ? 0.08 : (freshnessLossByStyle[playStyle] ?? 0.1)

  const enterMinute = player.enterMinute ?? 0
  const exitMinute = player.exitMinute ?? totalMinutes
  const minutesPlayed = Math.max(0, exitMinute - enterMinute)
  const totalRef = Math.max(1, totalMinutes)
  const playedShare = Math.max(0, Math.min(1, minutesPlayed / totalRef))

  const freshnessLoss = baseLoss * playedShare
  player.freshness = Math.max(0, player.freshness - freshnessLoss)
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
  const players = await query('SELECT * FROM player WHERE freshness < 1.0 AND is_injured = 0')
  const promises = []
  for (const player of players) {
    const recovery = _calculateFreshnessRecovery(await getPlayerAge(player, season), !!player.in_game_position)
    player.freshness = Math.min(1.0, player.freshness + recovery)
    promises.push(query('UPDATE player SET freshness=? WHERE id=?', [player.freshness, player.id]))
  }
  // Injured players lose 5% freshness per game day instead of recovering
  const injuredPlayers = await query('SELECT * FROM player WHERE is_injured = 1 AND freshness > 0')
  for (const player of injuredPlayers) {
    player.freshness = Math.max(0, player.freshness - 0.05)
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
 * Reduce injury_days_left by 1 for all injured players and clear injury when healed.
 * @returns {Promise<void>}
 */
async function _recoverInjuredPlayers () {
  const t1 = Date.now()
  // Decrement injury days
  await query('UPDATE player SET injury_days_left = injury_days_left - 1 WHERE is_injured = 1 AND injury_days_left > 0')
  // Find healed players (still flagged as injured but days ran out) before clearing them
  const healedPlayers = await query(
    'SELECT p.*, t.user_id as team_user_id FROM player p JOIN team t ON t.id = p.team_id WHERE p.is_injured = 1 AND p.injury_days_left <= 0 AND t.user_id IS NOT NULL'
  )
  // Clear healed players
  const result = await query(
    'UPDATE player SET is_injured = 0, injury_type = NULL, injury_days_left = 0 WHERE is_injured = 1 AND injury_days_left <= 0'
  )
  if (result.affectedRows > 0) {
    // Send recovery log messages
    for (const player of healedPlayers) {
      if (player.team_user_id) {
        const locale = await getUserLocale(player.team_user_id)
        const [team] = await query('SELECT * FROM team WHERE id=?', [player.team_id])
        if (team) {
          await addLogMessage(
            t('log.playerRecovered', { playerName: player.name }, locale),
            team,
            'OPEN_PLAYER',
            player.id,
            'heartbeat',
            undefined,
            'success'
          )
        }
      }
    }
    console.log(`Recovered ${result.affectedRows} injured players in ${Date.now() - t1}ms`)
  }
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
 * Exported for tests.
 * @returns {Promise<void>}
 */
export async function _giveUsersActionCards () {
  const t1 = Date.now()
  const { season } = await getGameDayAndSeason()
  /** @type {TeamType[]} */
  const teams = await query('SELECT * FROM team WHERE is_system_team = 0')
  const trainingAreaLevels = await getAllTrainingAreaLevels()
  const fitnessStudioLevels = await getAllFitnessStudioLevels()
  const teamIdsWithYouth = new Set(
    (await query('SELECT DISTINCT team_id FROM youth_player')).map(r => r.team_id)
  )
  const teamIdsWithSeasonYouthCard = new Set(
    (await query(
      "SELECT DISTINCT team_id FROM action_card WHERE action='NEW_YOUTH_PLAYER' AND season=?",
      [season]
    )).map(r => r.team_id)
  )
  const promises = []
  for (const team of teams) {
    const trainingLevel = trainingAreaLevels.get(team.id) ?? 1
    const cardOverrides = TRAINING_AREA_CARD_CHANCES[trainingLevel] || TRAINING_AREA_CARD_CHANCES[1]
    const fitnessLevel = fitnessStudioLevels.get(team.id) ?? 0
    const fitnessOverrides = FITNESS_STUDIO_CARD_CHANCES[fitnessLevel] || FITNESS_STUDIO_CARD_CHANCES[0]
    const actionCards = []
    // Guarantee a youth player card if the team currently has no youth player
    // and has not received a NEW_YOUTH_PLAYER card this season yet.
    const guaranteeYouthCard =
      !teamIdsWithYouth.has(team.id) && !teamIdsWithSeasonYouthCard.has(team.id)
    if (guaranteeYouthCard) {
      actionCards.push(new ActionCard({
        team_id: team.id,
        action: 'NEW_YOUTH_PLAYER',
        played: 0,
        state: 'pending',
        season
      }))
      teamIdsWithSeasonYouthCard.add(team.id)
    }
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
            state: 'pending',
            season
          }))
        }
        if (Math.random() < remainder) {
          actionCards.push(new ActionCard({
            team_id: team.id,
            action,
            played: 0,
            state: 'pending',
            season
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
  const strengthFactor = ((strengthTeamA || 0) * (strengthTeamB || 0)) / 80
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
  let operationalCapacity = 0
  let totalAttendance = 0
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

    // Only operational stands contribute to the fill-rate used for the home bonus
    operationalCapacity += size

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
    totalAttendance += amountOfGuests
    const earnings = amountOfGuests * price
    details[stand + 'Earnings'] = earnings
    totalEarnings += earnings
  }

  details.totalCapacity = totalCapacity
  details.totalAttendance = totalAttendance
  details.totalEarnings = totalEarnings

  const homeBonus = calculateHomeAttendanceBonus(totalAttendance, operationalCapacity)
  details.homeBonusPct = homeBonus.bonusPct
  details.homeBonusMultiplier = homeBonus.multiplier

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
 * Persist a forfeit result: the side with no fielded players loses 0:3.
 * If both sides are empty the game is recorded as 0:0 — cup logic will
 * still pick a winner via the home-team fallback when needed.
 * @param {GameType} game
 * @param {TeamType} teamA
 * @param {TeamType} teamB
 * @param {number} fieldedA
 * @param {number} fieldedB
 * @param {'league'|'cup'} gameType
 * @returns {Promise<void>}
 */
async function _forfeitGame (game, teamA, teamB, fieldedA, fieldedB, gameType) {
  const aMissing = fieldedA === 0
  const bMissing = fieldedB === 0
  const goalsTeamA = !aMissing && bMissing ? 3 : 0
  const goalsTeamB = aMissing && !bMissing ? 3 : 0
  console.warn(`[FORFEIT] ${gameType} game ${game.id}: ${teamA?.name} (${fieldedA}) vs ${teamB?.name} (${fieldedB}) → ${goalsTeamA}:${goalsTeamB}`)
  await query(
    'UPDATE game SET played=1, is_forfeit=1, goals_team_1=?, goals_team_2=?, details=?, created_at=? WHERE id=?',
    [goalsTeamA, goalsTeamB, '{}', new Date(), game.id]
  )
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

  // Filter out suspended and injured players (they miss this game)
  let playerTeamA = allPlayerTeamA.filter(p => !p.is_suspended && !p.is_injured)
  let playerTeamB = allPlayerTeamB.filter(p => !p.is_suspended && !p.is_injured)

  // Trim excess players and auto-fill incomplete lineups before the game
  playerTeamA = await trimExcessLineup(teamA, playerTeamA)
  playerTeamB = await trimExcessLineup(teamB, playerTeamB)
  playerTeamA = await autoFillLineup(teamA, playerTeamA)
  playerTeamB = await autoFillLineup(teamB, playerTeamB)

  // If either side can't field anyone (e.g. inherited bot team emptied via
  // transfers before a user took over), forfeit 3:0 to the present team
  // instead of crashing later in playGameStep. A stuck game blocks the cron
  // because getGameDayAndSeason() keeps returning the same game_day.
  if (playerTeamA.length === 0 || playerTeamB.length === 0) {
    return _forfeitGame(game, teamA, teamB, playerTeamA.length, playerTeamB.length, 'league')
  }

  // Remove lineup players from bench (they can't be in both)
  await _clearBenchForLineupPlayers(playerTeamA)
  await _clearBenchForLineupPlayers(playerTeamB)

  // Load bench players
  const benchTeamA = await _loadBenchPlayers(game.team_1_id)
  const benchTeamB = await _loadBenchPlayers(game.team_2_id)

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
    teamB,
    benchTeamA,
    benchTeamB
  }
  // Store original freshness and level before modification
  for (const player of [...playerTeamA, ...playerTeamB]) {
    player.originalFreshness = player.freshness
    player.originalLevel = player.level
    player.enterMinute = 0
  }
  for (const player of playerTeamA) {
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
    // Players playing out of their natural position are only half as effective
    if (player.position !== player.in_game_position) {
      player.level *= 0.5
    }
  }
  for (const player of playerTeamB) {
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
    // Players playing out of their natural position are only half as effective
    if (player.position !== player.in_game_position) {
      player.level *= 0.5
    }
  }
  // Apply level modifiers to bench players too
  _applyLevelModifiersToBench(benchTeamA, teamA, game.season, playerTeamA)
  _applyLevelModifiersToBench(benchTeamB, teamB, game.season, playerTeamB)
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
  // Apply captain strength modifier
  const captainMultiplierA = getCaptainStrengthMultiplier(teamA, playerTeamA, game.season)
  const captainMultiplierB = getCaptainStrengthMultiplier(teamB, playerTeamB, game.season)
  for (const player of playerTeamA) {
    player.level *= captainMultiplierA
  }
  for (const player of playerTeamB) {
    player.level *= captainMultiplierB
  }
  // Bot teams play 10% weaker to give human players an advantage
  if (!teamA.user_id) {
    for (const player of playerTeamA) {
      player.level *= 0.9
    }
  }
  if (!teamB.user_id) {
    for (const player of playerTeamB) {
      player.level *= 0.9
    }
  }
  // Apply home-team attendance bonus / empty-stadium malus to teamA (the home side)
  const homeBonusMultiplier = stadiumDetails?.homeBonusMultiplier ?? 1
  if (homeBonusMultiplier !== 1) {
    for (const player of playerTeamA) {
      player.level *= homeBonusMultiplier
    }
  }
  // Store effective strength after all modifiers for display
  gameDetails.effectiveStrengthTeamA = Math.round(playerTeamA.reduce((sum, p) => sum + p.level, 0))
  gameDetails.effectiveStrengthTeamB = Math.round(playerTeamB.reduce((sum, p) => sum + p.level, 0))
  kickoff(playerTeamA, playerTeamB, gameDetails)
  const overtime = Math.floor(Math.random() * 50)
  const totalSteps = 900 + overtime
  for (let step = 0; step < totalSteps; step++) {
    // Convert step to match minute (0-89 for regular time, 90+ for overtime)
    // Each 10 steps = 1 minute in regular time
    gameDetails.currentMinute = step < 900 ? Math.floor(step / 10) : 90 + Math.floor((step - 900) / 10)
    playGameStep(playerTeamA, playerTeamB, gameDetails)
  }
  const leagueTotalMinutes = (gameDetails.currentMinute ?? 89) + 1
  gameDetails.totalMinutes = leagueTotalMinutes
  delete gameDetails.currentMinute // Don't persist internal tracking field

  // Persist injuries to database and send log messages
  await _persistInjuries(gameDetails, teamA, teamB)

  await query('UPDATE game SET details=?, played=1, goals_team_1=?, goals_team_2=?, created_at=? WHERE id=?', [
    JSON.stringify(gameDetails),
    gameDetails.goalsTeamA,
    gameDetails.goalsTeamB,
    new Date(),
    game.id
  ])

  for (const player of playerTeamA) {
    _applyFreshnessLoss(player, teamA, leagueTotalMinutes)
    await _updatePlayerAfterGame(player, gameDetails, teamA)
  }
  for (const player of playerTeamB) {
    _applyFreshnessLoss(player, teamB, leagueTotalMinutes)
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
  } else if (newYellowCards >= 5) {
    // 5 yellow cards = suspended for next match
    isSuspended = true
  }

  // Update player in database
  await query(
    'UPDATE player SET freshness=?, yellow_cards=?, red_cards=?, is_suspended=? WHERE id=?',
    [player.freshness, newYellowCards, newRedCards, isSuspended ? 1 : 0, player.id]
  )

  // If newly suspended, remove from lineup and notify the team owner with one combined message
  if (isSuspended && team.user_id) {
    await _notifySuspension(player, team, sentOff ? 'red' : 'fiveYellows')
  }
}

/**
 * Removes a suspended player from the lineup and sends a single combined log message
 * covering: cards reason, suspension, lineup removal, and incomplete lineup count.
 * @param {PlayerType} player
 * @param {TeamType} team
 * @param {'red' | 'fiveYellows'} cause
 */
async function _notifySuspension (player, team, cause) {
  const locale = await getUserLocale(team.user_id)
  const wasInLineup = !!player.in_game_position

  let lineupSuffix = ''
  if (wasInLineup) {
    await query('UPDATE player SET in_game_position=\'\' WHERE id=?', [player.id])
    const [{ count }] = await query(
      'SELECT COUNT(*) as count FROM player WHERE team_id=? AND in_game_position IS NOT NULL AND in_game_position <> \'\'',
      [team.id]
    )
    lineupSuffix = ' ' + t('log.playerRemovedFromLineup', { playerName: player.name }, locale)
    if (count < 11) {
      lineupSuffix += ' ' + t('log.incompleteLineup', { count }, locale)
    }
  }

  const cardsMsg = cause === 'red'
    ? t('log.playerRedCard', { playerName: player.name }, locale)
    : t('log.playerFiveYellows', { playerName: player.name }, locale)
  const suspendedMsg = t('log.playerSuspended', { playerName: player.name }, locale)

  await addLogMessage(
    cardsMsg + ' ' + suspendedMsg + lineupSuffix,
    team,
    'OPEN_PLAYER',
    player.id,
    'ban',
    undefined,
    'danger'
  )
}

/**
 * Load bench players for a team (players with bench_position set)
 * @param {number} teamId
 * @returns {Promise<Object>} bench object keyed by bench position
 */
async function _loadBenchPlayers (teamId) {
  const benchPlayers = await query(
    'SELECT * FROM player WHERE team_id=? AND bench_position IS NOT NULL AND bench_position <> \'\' AND is_suspended=0 AND is_injured=0',
    [teamId]
  )
  const bench = {}
  for (const player of benchPlayers) {
    player.originalFreshness = player.freshness
    bench[player.bench_position] = player
  }
  return bench
}

/**
 * Apply level modifiers to bench players so they're ready for substitution
 * @param {Object} bench - Bench object keyed by bench position
 * @param {TeamType} team
 * @param {number} season
 * @param {GamePlayer[]} lineupPlayers - For captain multiplier calculation
 */
function _applyLevelModifiersToBench (bench, team, season, lineupPlayers) {
  if (!bench) return
  const captainMultiplier = getCaptainStrengthMultiplier(team, lineupPlayers, season)
  for (const player of Object.values(bench)) {
    if (!player) continue
    player.originalFreshness = player.freshness
    player.originalLevel = player.level
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
    if (team.motivating_speech_active) player.level *= 1.1
    player.level *= captainMultiplier
    if (!team.user_id) player.level *= 0.9
  }
}

/**
 * Persist injuries from game details to database and send log messages
 * @param {GameDetails} gameDetails
 * @param {TeamType} teamA
 * @param {TeamType} teamB
 */
async function _persistInjuries (gameDetails, teamA, teamB) {
  if (!gameDetails.injuries || gameDetails.injuries.length === 0) return

  for (const injury of gameDetails.injuries) {
    await query(
      'UPDATE player SET is_injured=1, injury_type=?, injury_days_left=? WHERE id=?',
      [injury.injuryType, injury.injuryDays, injury.playerId]
    )

    const team = injury.teamIndex === 0 ? teamA : teamB
    if (team.user_id) {
      const locale = await getUserLocale(team.user_id)
      await addLogMessage(
        t('log.playerInjured', {
          playerName: injury.playerName,
          injuryType: injury.injuryType,
          days: injury.injuryDays
        }, locale),
        team,
        'OPEN_PLAYER',
        injury.playerId,
        'medkit',
        undefined,
        'danger'
      )
    }
  }

  // Send substitution log messages
  if (gameDetails.substitutions) {
    for (const sub of gameDetails.substitutions) {
      const team = sub.teamIndex === 0 ? teamA : teamB
      if (team.user_id) {
        const locale = await getUserLocale(team.user_id)
        const logKey = sub.reason === 'injury' ? 'log.playerSubstitutedInjury' : 'log.playerSubstitutedFreshness'
        await addLogMessage(
          t(logKey, {
            playerOutName: sub.playerOutName,
            playerInName: sub.playerInName
          }, locale),
          team,
          'OPEN_MY_TEAM_PAGE',
          null,
          'exchange',
          undefined,
          'info'
        )
      }
    }
  }
}

/**
 * Remove bench_position from players who are in the lineup.
 * Prevents a player from being both in the starting XI and on the bench.
 * @param {PlayerType[]} lineupPlayers
 */
async function _clearBenchForLineupPlayers (lineupPlayers) {
  const ids = lineupPlayers.filter(p => p.bench_position).map(p => p.id)
  if (ids.length === 0) return
  await query('UPDATE player SET bench_position=NULL WHERE id IN (?)', [ids])
  for (const p of lineupPlayers) {
    p.bench_position = null
  }
}

