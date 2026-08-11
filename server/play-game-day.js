import { query } from './lib/database.js'
import { ActionCard } from './entities/actionCard.js'
import { getSponsor } from './helper/sponsorHelper.js'
import { updateTeamBalance } from './helper/financeHelper.js'
import { getSalary, getPositionLevelFactor } from '../client/util/player.js'
import { getGameDayAndSeason } from './helper/gameDayHelper.js'
import { getPlayerAge } from './helper/playerHelper.js'
import { actionCardChances, deleteExpiredPendingCards, NEW_YOUTH_PLAYER_ACTIONS, MAX_YOUTH_CARDS_PER_SEASON, MAX_ACTION_CARDS_PER_TYPE } from './helper/actionCardHelper.js'
import { generateMatchDayRecapsForGameDay } from './helper/matchDayRecapHelper.js'
import { completeStadiumConstructions, calculateHomeAttendanceBonus } from './helper/stadiumHelper.js'
import {
  completeBuildingConstructions,
  FITNESS_STUDIO_CARD_CHANCES,
  getAllFitnessStudioLevels,
  getAllMedicalPracticeLevels,
  getAllTrainingAreaLevels,
  getAllYouthAcademyLevels,
  MEDICAL_PRACTICE_CARD_CHANCES,
  TRAINING_AREA_CARD_CHANCES,
  YOUTH_ACADEMY_CARD_CHANCES,
  YOUTH_ACADEMY_GUARANTEED_CARD
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
import { payOutTvMoneyForSeason } from './helper/tvMoneyHelper.js'
import { kickoff, playGameStep } from './play-game.js'
import { sendGameDayPushNotifications } from './helper/pushNotificationHelper.js'
import { getCaptainStrengthMultiplier } from './helper/captainHelper.js'
import { getSquadAgeStrengthMultiplier } from './helper/squadAgeHelper.js'
import { autoFillLineup, trimExcessLineup } from './helper/lineupHelper.js'

// Real football: a match cannot continue with fewer than 7 players on a side.
export const MIN_PLAYERS_TO_PLAY = 7

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
  await payOutTvMoneyForSeason(gameDay, season, {
    updateTeamBalance,
    getUserLocale,
    t
  })
  await cachePlayerStatsForGameDay(gameDay, season)
  await cacheTeamStatsForGameDay(gameDay, season)
  await deleteExpiredPendingCards()
  await _giveUsersActionCards()
  await _letTeamsPaySallaries(gameDay, season)
  await _giveSponsorMoney(gameDay, season)
  await _recoverInjuredPlayers()
  await _giveAllPlayersFreshness(season)
  await _processYouthTeams()
  await generateMatchDayRecapsForGameDay(gameDay, season)
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

  // If either side can't field at least MIN_PLAYERS_TO_PLAY (real-football
  // abandonment rule, also catches inherited bot teams emptied via transfers
  // before a user took over), forfeit instead of crashing later in
  // playGameStep. Cup needs a winner, so award 3:0 to the present team.
  if (playerTeamA.length < MIN_PLAYERS_TO_PLAY || playerTeamB.length < MIN_PLAYERS_TO_PLAY) {
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
    // Out of position costs 10-50% depending on how far from home the slot is
    // (#540) — see getPositionPenalty.
    player.level *= getPositionLevelFactor(player.position, player.in_game_position)
  }
  for (const player of playerTeamB) {
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
    // Out of position costs 10-50% depending on how far from home the slot is
    // (#540) — see getPositionPenalty.
    player.level *= getPositionLevelFactor(player.position, player.in_game_position)
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
  // Apply squad-age strength modifier (ideal average age 27, ±5%)
  const cupAgeMultiplierA = getSquadAgeStrengthMultiplier(playerTeamA, game.season)
  const cupAgeMultiplierB = getSquadAgeStrengthMultiplier(playerTeamB, game.season)
  for (const player of playerTeamA) {
    player.level *= cupAgeMultiplierA
  }
  for (const player of playerTeamB) {
    player.level *= cupAgeMultiplierB
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

  // Cup games cannot end in a draw — play 30 min extra time, then penalty shootout
  if (gameDetails.goalsTeamA === gameDetails.goalsTeamB) {
    gameDetails.extraTime = true
    console.log(`Cup match is a draw after regular time (${gameDetails.goalsTeamA}-${gameDetails.goalsTeamB}), playing extra time...`)
    const extraTimeSteps = 300 // 30 minutes at 10 steps/minute
    for (let step = 0; step < extraTimeSteps; step++) {
      gameDetails.currentMinute = 91 + Math.floor(step / 10)
      playGameStep(playerTeamA, playerTeamB, gameDetails)
    }

    if (gameDetails.goalsTeamA === gameDetails.goalsTeamB) {
      _playPenaltyShootout(playerTeamA, playerTeamB, gameDetails)
    } else {
      console.log(`Cup extra time decided: ${gameDetails.goalsTeamA}-${gameDetails.goalsTeamB}`)
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

  const cupStrengthScale = getFreshnessLossStrengthScale(strengthTeamA + strengthTeamB)
  for (const player of playerTeamA) {
    _applyFreshnessLoss(player, teamA, cupTotalMinutes, cupStrengthScale)
    await _updatePlayerAfterGame(player, gameDetails, teamA)
  }
  for (const player of playerTeamB) {
    _applyFreshnessLoss(player, teamB, cupTotalMinutes, cupStrengthScale)
    await _updatePlayerAfterGame(player, gameDetails, teamB)
  }

  // Send log messages to team owners about the cup match result
  await sendCupMatchLogMessages(game, gameDetails)
}

// Number of shooters per team in the initial (non-sudden-death) rounds of a penalty shootout.
export const PENALTY_SHOOTOUT_INITIAL_ROUNDS = 5
// Hard cap on sudden-death rounds to prevent an infinite loop if the coin flip keeps tying.
const PENALTY_SHOOTOUT_MAX_SUDDEN_DEATH = 100

/**
 * Simulate a penalty shootout between the two starting lineups.
 * Each shot is a 50/50 coin flip. Top 5 shooters (by originalLevel) shoot first;
 * if still tied after 5 rounds each, we go to sudden death and reuse the same ranked list.
 * Mutates gameDetails: adds `penaltyShootout` details and increments the winning team's goal count by 1.
 */
export function _playPenaltyShootout (playerTeamA, playerTeamB, gameDetails) {
  const rank = p => p.originalLevel ?? p.level
  const shootersA = [...playerTeamA].sort((a, b) => rank(b) - rank(a))
  const shootersB = [...playerTeamB].sort((a, b) => rank(b) - rank(a))

  const shots = []
  let scoreA = 0
  let scoreB = 0

  const shoot = (team, shooter) => {
    const scored = Math.random() < 0.5
    if (scored) {
      if (team === 'A') scoreA++
      else scoreB++
    }
    shots.push({
      team,
      playerId: shooter.id,
      playerName: shooter.name,
      scored,
      scoreA,
      scoreB
    })
  }

  const isDecided = () => {
    const shotsA = shots.filter(s => s.team === 'A').length
    const shotsB = shots.filter(s => s.team === 'B').length
    const remainingA = Math.max(0, PENALTY_SHOOTOUT_INITIAL_ROUNDS - shotsA)
    const remainingB = Math.max(0, PENALTY_SHOOTOUT_INITIAL_ROUNDS - shotsB)
    if (scoreA > scoreB + remainingB) return true
    if (scoreB > scoreA + remainingA) return true
    return false
  }

  for (let i = 0; i < PENALTY_SHOOTOUT_INITIAL_ROUNDS; i++) {
    shoot('A', shootersA[i % shootersA.length])
    if (isDecided()) break
    shoot('B', shootersB[i % shootersB.length])
    if (isDecided()) break
  }

  let suddenDeathRound = 0
  while (scoreA === scoreB && suddenDeathRound < PENALTY_SHOOTOUT_MAX_SUDDEN_DEATH) {
    const idx = PENALTY_SHOOTOUT_INITIAL_ROUNDS + suddenDeathRound
    shoot('A', shootersA[idx % shootersA.length])
    shoot('B', shootersB[idx % shootersB.length])
    suddenDeathRound++
  }

  // Safety fallback: award home team if shootout somehow stayed tied (extreme edge case).
  if (scoreA === scoreB) {
    console.warn(`Penalty shootout hit safety cap at ${scoreA}-${scoreB} — awarding home team`)
    scoreA++
  }

  if (scoreA > scoreB) {
    gameDetails.goalsTeamA++
  } else {
    gameDetails.goalsTeamB++
  }

  gameDetails.penaltyShootout = {
    goalsTeamA: scoreA,
    goalsTeamB: scoreB,
    shots
  }
  console.log(`Cup penalty shootout decided: ${scoreA}-${scoreB}`)
}

// Combined team strength at which the historical static freshness loss applies (1.0x).
// Above this, players lose more freshness; below, they lose less.
export const FRESHNESS_LOSS_REFERENCE_STRENGTH = 1000
// Clamp the scaling factor so the effect is "not extreme" — see #355.
export const FRESHNESS_LOSS_MIN_SCALE = 0.5
export const FRESHNESS_LOSS_MAX_SCALE = 1.5

/**
 * Scale factor for freshness loss based on the combined raw strength of both
 * teams. The historical static loss matches a total strength of 1000. Stronger
 * matchups burn more fitness; bot/low-level matchups burn less.
 * @param {number} totalStrength
 * @returns {number}
 */
export function getFreshnessLossStrengthScale (totalStrength) {
  if (!Number.isFinite(totalStrength) || totalStrength <= 0) return 1
  const raw = totalStrength / FRESHNESS_LOSS_REFERENCE_STRENGTH
  return Math.max(FRESHNESS_LOSS_MIN_SCALE, Math.min(FRESHNESS_LOSS_MAX_SCALE, raw))
}

/**
 * Apply freshness loss scaled by the share of the match a player was on the pitch
 * and by the combined raw strength of both teams (see #355).
 * Substitutes who came on later, and players who left early (substituted out, sent off,
 * injured-and-replaced) lose proportionally less.
 *
 * @param {GamePlayer} player
 * @param {TeamType} team
 * @param {number} totalMinutes
 * @param {number} strengthScale - multiplier from {@link getFreshnessLossStrengthScale}
 */
function _applyFreshnessLoss (player, team, totalMinutes, strengthScale = 1) {
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

  const freshnessLoss = baseLoss * playedShare * strengthScale
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
  const youthAcademyLevels = await getAllYouthAcademyLevels()
  const medicalPracticeLevels = await getAllMedicalPracticeLevels()
  const teamIdsWithYouth = new Set(
    (await query('SELECT DISTINCT team_id FROM youth_player')).map(r => r.team_id)
  )
  // How many youth cards each team has already received this season, so we can
  // cap the season total at MAX_YOUTH_CARDS_PER_SEASON.
  const youthCardCountBySeason = new Map(
    (await query(
      "SELECT team_id, COUNT(*) AS cnt FROM action_card WHERE action IN ('NEW_YOUTH_PLAYER_1','NEW_YOUTH_PLAYER_2','NEW_YOUTH_PLAYER_3') AND season=? GROUP BY team_id",
      [season]
    )).map(r => [r.team_id, Number(r.cnt)])
  )
  // How many held-or-pending (played=0) cards each team already has per action
  // type. A type can only be claimed up to MAX_ACTION_CARDS_PER_TYPE, so dealing
  // a card past that limit would leave it stuck as `pending` forever and trap
  // the user on the dashboard claim overlay — we skip such cards below instead.
  // Keyed `${team_id}:${action}` and incremented as we deal within this run.
  const heldCountByTeamAction = new Map()
  ;(await query(
    "SELECT team_id, action, COUNT(*) AS cnt FROM action_card WHERE played=0 AND state IN ('received','pending') GROUP BY team_id, action"
  )).forEach(r => heldCountByTeamAction.set(`${r.team_id}:${r.action}`, Number(r.cnt)))
  const promises = []
  for (const team of teams) {
    const trainingLevel = trainingAreaLevels.get(team.id) ?? 1
    const cardOverrides = TRAINING_AREA_CARD_CHANCES[trainingLevel] || TRAINING_AREA_CARD_CHANCES[1]
    const fitnessLevel = fitnessStudioLevels.get(team.id) ?? 0
    const fitnessOverrides = FITNESS_STUDIO_CARD_CHANCES[fitnessLevel] || FITNESS_STUDIO_CARD_CHANCES[0]
    const academyLevel = youthAcademyLevels.get(team.id) ?? 1
    const youthOverrides = YOUTH_ACADEMY_CARD_CHANCES[academyLevel] || YOUTH_ACADEMY_CARD_CHANCES[1]
    const medicalLevel = medicalPracticeLevels.get(team.id) ?? 0
    const medicalOverrides = MEDICAL_PRACTICE_CARD_CHANCES[medicalLevel] || MEDICAL_PRACTICE_CARD_CHANCES[0]
    const actionCards = []
    // Track how many youth cards this team has this season (already received +
    // newly dealt below) so we never exceed MAX_YOUTH_CARDS_PER_SEASON.
    let youthCardsThisSeason = youthCardCountBySeason.get(team.id) ?? 0
    // Guarantee a basic youth player card if the team currently has no youth player
    // and has not received any youth card this season yet.
    const guaranteeYouthCard =
      !teamIdsWithYouth.has(team.id) && youthCardsThisSeason === 0
    if (guaranteeYouthCard) {
      // The guaranteed card tier must match the academy level so the card
      // respects the advertised level range (L1 → Bronze, L2 → Silver, L3 → Gold).
      const guaranteedAction = YOUTH_ACADEMY_GUARANTEED_CARD[academyLevel] || 'NEW_YOUTH_PLAYER_1'
      actionCards.push(new ActionCard({
        team_id: team.id,
        action: guaranteedAction,
        played: 0,
        state: 'pending',
        season
      }))
      youthCardsThisSeason++
    }
    while (actionCards.length === 0) {
      for (const [action, defaultChance] of Object.entries(actionCardChances)) {
        // Override LEVEL_UP card chances based on training area level
        // Override FRESHNESS card chances based on fitness studio level
        // Override NEW_YOUTH_PLAYER_X card chances based on youth academy level
        // Override MEDICAL_TREATMENT card chance based on medical practice level
        let chance = defaultChance
        if (cardOverrides[action] !== undefined) chance = cardOverrides[action]
        if (fitnessOverrides[action] !== undefined) chance = fitnessOverrides[action]
        if (youthOverrides[action] !== undefined) chance = youthOverrides[action]
        if (medicalOverrides[action] !== undefined) chance = medicalOverrides[action]
        const isYouthCard = NEW_YOUTH_PLAYER_ACTIONS.has(action)
        // Youth cards are capped per season: once the limit is reached, stop
        // dealing them for the rest of the season.
        if (isYouthCard && youthCardsThisSeason >= MAX_YOUTH_CARDS_PER_SEASON) continue
        // For probabilities > 1, give floor(chance) guaranteed cards + remainder chance for one more
        const guaranteed = Math.floor(chance)
        const remainder = chance - guaranteed
        for (let i = 0; i < guaranteed; i++) {
          if (isYouthCard && youthCardsThisSeason >= MAX_YOUTH_CARDS_PER_SEASON) break
          actionCards.push(new ActionCard({
            team_id: team.id,
            action,
            played: 0,
            state: 'pending',
            season
          }))
          if (isYouthCard) youthCardsThisSeason++
        }
        if ((!isYouthCard || youthCardsThisSeason < MAX_YOUTH_CARDS_PER_SEASON) && Math.random() < remainder) {
          actionCards.push(new ActionCard({
            team_id: team.id,
            action,
            played: 0,
            state: 'pending',
            season
          }))
          if (isYouthCard) youthCardsThisSeason++
        }
      }
    }
    for (const actionCard of actionCards) {
      const key = `${team.id}:${actionCard.action}`
      const held = heldCountByTeamAction.get(key) ?? 0
      // Skip cards that couldn't be claimed anyway — they'd hang on `pending`.
      if (held >= MAX_ACTION_CARDS_PER_TYPE) continue
      heldCountByTeamAction.set(key, held + 1)
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

  const stands = ['north', 'south', 'west', 'east', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
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
 * Persist a forfeit result: the side that cannot field MIN_PLAYERS_TO_PLAY
 * loses 0:3. If both sides are under the minimum the game is recorded as 0:0
 * — cup logic will still pick a winner via the home-team fallback when needed.
 * @param {GameType} game
 * @param {TeamType} teamA
 * @param {TeamType} teamB
 * @param {number} fieldedA
 * @param {number} fieldedB
 * @param {'league'|'cup'} gameType
 * @returns {Promise<void>}
 */
async function _forfeitGame (game, teamA, teamB, fieldedA, fieldedB, gameType) {
  const aMissing = fieldedA < MIN_PLAYERS_TO_PLAY
  const bMissing = fieldedB < MIN_PLAYERS_TO_PLAY
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

  // If either side can't field at least MIN_PLAYERS_TO_PLAY (real-football
  // abandonment rule, also catches inherited bot teams emptied via transfers
  // before a user took over), forfeit 3:0 to the present team instead of
  // crashing later in playGameStep. A stuck game would block the cron because
  // getGameDayAndSeason() keeps returning the same game_day.
  if (playerTeamA.length < MIN_PLAYERS_TO_PLAY || playerTeamB.length < MIN_PLAYERS_TO_PLAY) {
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
    // Out of position costs 10-50% depending on how far from home the slot is
    // (#540) — see getPositionPenalty.
    player.level *= getPositionLevelFactor(player.position, player.in_game_position)
  }
  for (const player of playerTeamB) {
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
    // Out of position costs 10-50% depending on how far from home the slot is
    // (#540) — see getPositionPenalty.
    player.level *= getPositionLevelFactor(player.position, player.in_game_position)
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
  // Apply squad-age strength modifier (ideal average age 27, ±5%)
  const ageMultiplierA = getSquadAgeStrengthMultiplier(playerTeamA, game.season)
  const ageMultiplierB = getSquadAgeStrengthMultiplier(playerTeamB, game.season)
  for (const player of playerTeamA) {
    player.level *= ageMultiplierA
  }
  for (const player of playerTeamB) {
    player.level *= ageMultiplierB
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

  const leagueStrengthScale = getFreshnessLossStrengthScale(strengthTeamA + strengthTeamB)
  for (const player of playerTeamA) {
    _applyFreshnessLoss(player, teamA, leagueTotalMinutes, leagueStrengthScale)
    await _updatePlayerAfterGame(player, gameDetails, teamA)
  }
  for (const player of playerTeamB) {
    _applyFreshnessLoss(player, teamB, leagueTotalMinutes, leagueStrengthScale)
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
  const ageMultiplier = getSquadAgeStrengthMultiplier(lineupPlayers, season)
  for (const player of Object.values(bench)) {
    if (!player) continue
    player.originalFreshness = player.freshness
    player.originalLevel = player.level
    player.level = player.freshness * player.level * (player.is_star_player ? 1.1 : 1)
    if (team.motivating_speech_active) player.level *= 1.1
    player.level *= captainMultiplier
    player.level *= ageMultiplier
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
          injuryType: t(`injury.${injury.injuryType}`, {}, locale),
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

