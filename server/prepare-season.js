import { Game } from './entities/game.js'
import { Player } from './entities/player.js'
import { Team } from './entities/team.js'
import { query } from './lib/database.js'
import { Formation, getPositionsOfFormation, Position } from '../client/util/formation.js'
import { cityNames, clubPrefixes1, clubPrefixes2, playerNames } from './lib/name-library.js'
import { calculateGamePlan, calculateStanding, randomItem } from './lib/util.js'
import { Stadium } from './entities/stadium.js'
import { addLogMessage } from './helper/logMessageHelper.js'
import { defaultStadiumName } from './helper/stadiumHelper.js'
import { getTeamById } from './helper/teamHelper.js'
import { generateRandomEmblem } from './lib/emblem.js'
import { archiveOverageYouthPlayers, getYouthPlayersAt18 } from './helper/youthPlayerHelper.js'
import { getUserLocale, t } from './i18n/index.js'
import { createCupDraw, validateAndProgressCupRounds, calculateInterleavedSchedule } from './helper/cupHelper.js'
import { saveStandingToCache } from './helper/standingHelper.js'
import { config } from './config.js'

/**
 * This script is checking for enough games, teams and players
 * If too less, it creates those.
 * It is also managing the relegation and promotion at the end of a season
 */

const teamsPerLeague = 18
const maxLevels = 20
const startBalance = 100000 // €
const amountTeamsPerLevel = _calculateAmountPerLevel()
const minimumTeams = 126 // three leagues, will be overwritten by amount of users...

/**
 * @returns {Promise<void>}
 */
/**
 * @returns {Promise<boolean>} true if a new season was created
 */
export async function prepareSeason () {
  await _archiveTooOldPlayers()
  await _archiveOverageYouth()
  await _warnYouthPlayersAt18()
  await _resetPlayersForNewSeason()
  await _promotionRelegation()
  await _ajustAmountOfTeams()
  const newSeasonCreated = await _createGames()
  await _createCupDraw()
  console.log('✅ Prepared Season')
  return newSeasonCreated
}

/**
 * Create the cup draw for the new season
 * @returns {Promise<void>}
 */
async function _createCupDraw () {
  // Get the current season (the one with unplayed games or the latest played)
  const [currentSeasonGame] = await query(
    'SELECT season, game_day FROM game WHERE played=0 ORDER BY season ASC, game_day ASC LIMIT 1'
  )

  if (!currentSeasonGame) {
    return console.log('⏭️ No active season found for cup draw.')
  }

  const season = currentSeasonGame.season
  const currentGameDay = currentSeasonGame.game_day

  // Check if cup games already exist for this season
  const existingCupGames = await query(
    'SELECT * FROM game WHERE game_type=? AND season=? LIMIT 1',
    ['cup', season]
  )

  if (existingCupGames.length > 0) {
    console.log('⏭️ Cup draw already exists for this season.')
    await validateAndProgressCupRounds(season)
    return
  }

  // Compute interleaved schedule to get cup game_days that don't overlap with league
  const teams = await query('SELECT * FROM team WHERE is_system_team = 0')
  const leagueGameDays = (teamsPerLeague - 1) * 2
  const { cupGameDays } = calculateInterleavedSchedule(teams.length, leagueGameDays)

  // Only skip cup creation if the season is nearly over (last 2 game days)
  const totalGameDays = leagueGameDays + cupGameDays.size
  if (currentGameDay > totalGameDays - 2) {
    return console.log(`⏭️ Season ${season} nearly over (game day ${currentGameDay}), skipping cup draw.`)
  }

  const matchesCreated = await createCupDraw(season, currentGameDay, cupGameDays)
  console.log(`🏆 Cup draw created for season ${season}: ${matchesCreated} first round matches`)
  await validateAndProgressCupRounds(season)
}

/**
 * Retire players whose carrier ends this season. Only runs when the current
 * season is over (no unplayed league games), so retirements land on the
 * season transition — never mid-season. Without this gate, `_latestSeason()`
 * jumps to N+1 as soon as `_createGamesForNewSeason` inserts the next
 * season's schedule, and the next cron tick would retire the N+1 cohort
 * before they play a single game.
 * @returns {Promise<void>}
 */
async function _archiveTooOldPlayers () {
  if (!(await _newGamesNeeded())) {
    return console.log('⏭️ No player retirement needed because still games to play.')
  }
  const season = await _latestSeason() ?? 0
  /** @type {PlayerType[]} */
  const players = await query('SELECT * FROM player WHERE carrier_end_season<=? AND team_id IS NOT NULL', [season])
  if (players.length === 0) return
  const playerIds = players.map(p => p.id)
  await query('UPDATE player SET team_id=NULL WHERE id IN (?)', [playerIds])
  await query('DELETE FROM trade_offer WHERE player_id IN (?)', [playerIds])
  for (const player of players) {
    const team = await getTeamById(player.team_id)
    await addLogMessage(`Your player ${player.name} is saying goodbye and ends his carrier today.`, team, null, null, 'heart', undefined, 'info')
  }
  console.log(`👴🏽 ${players.length} players ended their carrier...`)
}

/**
 * Archive youth players who are 19+ years old
 * @returns {Promise<void>}
 */
async function _archiveOverageYouth () {
  const season = await _latestSeason() ?? 0
  const archivedCount = await archiveOverageYouthPlayers(season)
  console.log(`👶 ${archivedCount} youth players were auto-fired (age 19+)`)
}

/**
 * Warn users about youth players who will be auto-fired next season (currently
 * 18). Runs on the first CRON tick of a season only — without the flag the
 * same warning went out on *every* tick, i.e. twice a day for a whole season
 * to the same teams.
 * @returns {Promise<void>}
 */
export async function _warnYouthPlayersAt18 () {
  const season = await _latestSeason() ?? 0
  const [flag] = await query('SELECT setting_value FROM app_setting WHERE setting_key=?', ['last_youth_warning_season'])
  if (flag && Number(flag.setting_value) >= season) {
    return console.log(`⏭️ Youth 18-year-old warnings for season ${season} already sent.`)
  }
  const teams = await query('SELECT * FROM team WHERE user_id IS NOT NULL')

  for (const team of teams) {
    const youthAt18 = await getYouthPlayersAt18(team.id, season)
    if (youthAt18.length === 0) continue
    const locale = await getUserLocale(team.user_id)
    const playerNames = youthAt18.map(y => y.name).join(', ')

    await addLogMessage(
      t('log.youthPlayerAt18Warning', { playerNames }, locale),
      team,
      null,
      null,
      'exclamation-triangle',
      undefined,
      'warning'
    )
  }
  await query(
    'INSERT INTO app_setting (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
    ['last_youth_warning_season', String(season)]
  )
}

/**
 * Reset all players to full freshness and clear cards/suspensions for the new season
 * @returns {Promise<void>}
 */
async function _resetPlayersForNewSeason () {
  if (!(await _newGamesNeeded())) {
    return console.log('⏭️ No player reset needed because still games to play.')
  }
  const result = await query(
    'UPDATE player SET freshness=1.0, yellow_cards=0, red_cards=0, is_suspended=0 WHERE team_id IS NOT NULL'
  )
  console.log(`🔄 Reset ${result.affectedRows} players: freshness=100%, cards and suspensions cleared.`)
}

/**
 * @returns {Promise<void>}
 */
async function _promotionRelegation () {
  if (!(await _newGamesNeeded())) {
    return console.log('⏭️ No promotion, relegation needed because still games to play.')
  }
  const season = await _latestSeason()
  if (typeof season === 'undefined') {
    return console.log('⏭️ No promotion, relegation needed because no season available.')
  }
  // Idempotency: once the transition for season N has been applied, skip on
  // subsequent CRON ticks even if game creation later failed and we get back
  // into a "_newGamesNeeded" state. The flag is set at the end of this
  // function once team levels have been shifted.
  const [flag] = await query('SELECT setting_value FROM app_setting WHERE setting_key=?', ['last_promoted_season'])
  if (flag && Number(flag.setting_value) >= season) {
    return console.log(`⏭️ Promotion/relegation for season ${season} already ran.`)
  }
  const games = await query('SELECT * FROM game WHERE season=? AND (game_type=\'league\' OR game_type IS NULL)', [season])
  const teams = await query('SELECT * FROM team WHERE is_system_team = 0')
  let hightestLevel = 0
  const gamesByLevelAndLeague = {}
  for (const game of games) {
    if (game.level > hightestLevel) hightestLevel = game.level
    gamesByLevelAndLeague[game.level] = gamesByLevelAndLeague[game.level] ?? {}
    gamesByLevelAndLeague[game.level][game.league] = gamesByLevelAndLeague[game.level][game.league] ?? []
    gamesByLevelAndLeague[game.level][game.league].push(game)
  }
  const promises = []
  for (const level in gamesByLevelAndLeague) {
    if (Object.hasOwnProperty.call(gamesByLevelAndLeague, level)) {
      const leagues = gamesByLevelAndLeague[level]
      for (const league in leagues) {
        if (Object.hasOwnProperty.call(leagues, league)) {
          const gamesOfLeague = leagues[league]
          // calculateStanding produces one row per team it's given. If we hand
          // it the full team list, teams from other leagues end up tied at
          // zero points and pollute positions 14..17 of the result — so the
          // "bottom 4" slice can pick the wrong teams to relegate. Restrict
          // the input to the teams that actually appear in this league's
          // games.
          const leagueTeamIds = new Set()
          for (const g of gamesOfLeague) {
            if (g.team_1_id) leagueTeamIds.add(g.team_1_id)
            if (g.team_2_id) leagueTeamIds.add(g.team_2_id)
          }
          const leagueTeams = teams.filter(t => leagueTeamIds.has(t.id))
          const standing = calculateStanding(gamesOfLeague, leagueTeams)
          const teamsForPromotion = [
            standing[0].team,
            standing[1].team
          ].filter(t => t.level > 0) // teams on first level cannot get promoted...
          console.log('Promotion for: ', teamsForPromotion)
          teamsForPromotion.forEach(t => {
            promises.push(addLogMessage('Congratulations! Your team got promoted to the next higher league!', t, null, null, 'arrow-up', undefined, 'success'))
            promises.push(query('UPDATE team SET level=? WHERE id=?', [t.level - 1, t.id]))
          })
          const teamsForRelegation = [
            standing[teamsPerLeague - 1].team,
            standing[teamsPerLeague - 2].team,
            standing[teamsPerLeague - 3].team,
            standing[teamsPerLeague - 4].team
          ].filter(t => t.level < hightestLevel) // teams in last level cannot go for relegation...
          console.log('Relegation for ', teamsForRelegation)
          teamsForRelegation.forEach(t => {
            promises.push(addLogMessage('Very sad... Your team needs to got to the next lower league.', t, null, null, 'arrow-down', undefined, 'danger'))
            promises.push(query('UPDATE team SET level=? WHERE id=?', [t.level + 1, t.id]))
          })
        }
      }
    }
  }
  console.log('Teams to move: ', promises.length)
  await Promise.all(promises)
  await query(
    'INSERT INTO app_setting (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
    ['last_promoted_season', String(season)]
  )
  console.log('Relegation and promotion done.')
}

/**
 * Create league games. Two scenarios:
 *  1. **New season** — no unplayed league games exist anywhere. Create the
 *     full schedule for every level/league of the next season (returns true,
 *     which makes the cron skip game calculation for this tick).
 *  2. **Mid-season** — a season is in progress, but newly opened levels (e.g.
 *     because a fresh user registration triggered level N) have no games yet.
 *     Generate the full schedule for those level/league combos and mark all
 *     matchdays before the current game day as forfeits (0:0, no points).
 *     Returns false so the cron continues the regular game day calculation.
 * @returns {Promise<boolean>} true if a brand-new season was created
 */
async function _createGames () {
  const [activeGame] = await query(
    'SELECT season, game_day FROM game WHERE played=0 AND (game_type=\'league\' OR game_type IS NULL) ORDER BY season ASC, game_day ASC LIMIT 1'
  )
  if (!activeGame) {
    return await _createGamesForNewSeason()
  }
  await _createGamesForNewLevels(activeGame.season, activeGame.game_day)
  return false
}

/**
 * Full schedule generation for a brand-new season.
 * @returns {Promise<boolean>} true if any games were created
 */
async function _createGamesForNewSeason () {
  const season = await _seasonForNewGames()
  const gamePlan = calculateGamePlan(teamsPerLeague)
  const teams = await query('SELECT * FROM team WHERE is_system_team = 0')

  // Compute interleaved schedule so league and cup days never overlap
  const leagueGameDays = (teamsPerLeague - 1) * 2 // 34 for 18-team leagues
  const { leagueDayMap } = calculateInterleavedSchedule(teams.length, leagueGameDays)

  for (let level = 0; level < maxLevels; level++) {
    const teamsOfLevel = teams.filter(t => t.level === level)
    if (teamsOfLevel.length === 0) break
    const teamsByLeague = _assignTeamsToParallelLeagues(teamsOfLevel)
    await Promise.all(teamsByLeague.map((teamsOfLeague, league) => {
      return _createGamesForLeague(season, level, league, teamsOfLeague, gamePlan, leagueDayMap, 0)
    }))
  }
  console.log(`Created games for season ${season}`)
  return true
}

/**
 * Reconstruct the leagueDayMap (index = league day 0..33, value = actual
 * game_day) from games that already exist for the season. Returns null when
 * the existing data doesn't cover a full schedule, so the caller can fall
 * back to a freshly computed map.
 * @param {number} season
 * @returns {Promise<number[]|null>}
 */
export async function _existingLeagueDayMap (season) {
  const expectedLength = (teamsPerLeague - 1) * 2
  const rows = await query(
    `SELECT match_day, MIN(game_day) AS game_day
     FROM game
     WHERE season=? AND match_day IS NOT NULL AND (game_type='league' OR game_type IS NULL)
     GROUP BY match_day
     ORDER BY match_day ASC`,
    [season]
  )
  if (rows.length !== expectedLength) return null
  const map = new Array(expectedLength)
  for (const r of rows) {
    if (r.match_day < 1 || r.match_day > expectedLength) return null
    map[r.match_day - 1] = r.game_day
  }
  // Defensive: a row could have a NULL game_day in theory; treat as incomplete.
  if (map.some(d => d == null)) return null
  return map
}

/**
 * For each level that currently has teams but no games for the active season,
 * generate the full schedule and mark past matchdays as forfeits.
 * @param {number} season
 * @param {number} currentGameDay - first unplayed game_day for the active season
 * @returns {Promise<void>}
 */
async function _createGamesForNewLevels (season, currentGameDay) {
  const teams = await query('SELECT * FROM team WHERE is_system_team = 0')
  const gamePlan = calculateGamePlan(teamsPerLeague)
  const leagueGameDays = (teamsPerLeague - 1) * 2

  // Reuse the season's existing match_day → game_day mapping so a new level
  // lines up with the leagues that already exist. Recomputing with the
  // current team count would yield a different cup-day insertion pattern
  // (because the team count has grown since the season started) and shift
  // every match_day onto a different game_day — leaving the new level
  // permanently lagging the rest of the season.
  const reusedMap = await _existingLeagueDayMap(season)
  const leagueDayMap = reusedMap ?? calculateInterleavedSchedule(teams.length, leagueGameDays).leagueDayMap

  for (let level = 0; level < maxLevels; level++) {
    const teamsOfLevel = teams.filter(t => t.level === level)
    if (teamsOfLevel.length === 0) break
    const [{ amount: existingGames }] = await query(
      'SELECT COUNT(*) AS amount FROM game WHERE season=? AND level=? AND (game_type=\'league\' OR game_type IS NULL)',
      [season, level]
    )
    if (existingGames > 0) continue
    const teamsByLeague = _assignTeamsToParallelLeagues(teamsOfLevel)
    await Promise.all(teamsByLeague.map((teamsOfLeague, league) => {
      return _createGamesForLeague(season, level, league, teamsOfLeague, gamePlan, leagueDayMap, currentGameDay)
    }))
    await Promise.all(teamsByLeague.map((teamsOfLeague, league) => {
      return _primeStandingCacheForNewLeague(season, level, league, teamsOfLeague)
    }))
    console.log(`📅 Mid-season schedule created for level ${level} (${teamsByLeague.length} parallel league(s)) — backfilled past days 0..${currentGameDay - 1} as forfeits`)
  }
}

/**
 * After mid-season league creation, populate standing_cache entries for every
 * past game day of the new (level, league). Since all backfilled games are
 * forfeits, calculateStanding returns zero-point rows for all teams.
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @param {TeamType[]} teams
 * @returns {Promise<void>}
 */
async function _primeStandingCacheForNewLeague (season, level, league, teams) {
  const games = await query(
    'SELECT * FROM game WHERE season=? AND level=? AND league=? AND played=1 AND (game_type=\'league\' OR game_type IS NULL)',
    [season, level, league]
  )
  if (games.length === 0) return
  const pastGameDays = [...new Set(games.map(g => g.game_day))].sort((a, b) => a - b)
  for (const gameDay of pastGameDays) {
    const gamesUpToDay = games.filter(g => g.game_day <= gameDay)
    const standing = calculateStanding(gamesUpToDay, teams)
    await saveStandingToCache(gameDay, season, level, league, standing)
  }
}

/**
 * Assign teams to parallel leagues at the same level and persist the league
 * number on each team row.
 *
 * Human-managed teams (with a `user_id`) are spread out evenly across the
 * parallel leagues via a round-robin so we don't end up with one league full
 * of managers and the others populated only by bots. Bots then fill the
 * remaining slots. Both groups are shuffled first so the mix changes every
 * season instead of following a stale, deterministic order.
 *
 * @param {TeamType[]} teamsOfLevel
 * @returns {TeamType[][]}
 */
export function _assignTeamsToParallelLeagues (teamsOfLevel) {
  const total = teamsOfLevel.length
  const numLeagues = Math.max(1, Math.ceil(total / teamsPerLeague))

  // Capacity per league: every league holds teamsPerLeague, except a final
  // partial league that takes the remainder.
  const capacity = Array.from({ length: numLeagues }, (_, l) =>
    Math.min(teamsPerLeague, total - l * teamsPerLeague))

  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5)
  const managers = shuffle(teamsOfLevel.filter(t => t.user_id != null))
  const bots = shuffle(teamsOfLevel.filter(t => t.user_id == null))

  const leagues = Array.from({ length: numLeagues }, () => [])

  // Round-robin placement that skips leagues which are already at capacity.
  let cursor = 0
  const place = (team) => {
    let guard = 0
    while (leagues[cursor].length >= capacity[cursor]) {
      cursor = (cursor + 1) % numLeagues
      if (++guard > numLeagues) return // all full — should never happen
    }
    leagues[cursor].push(team)
    cursor = (cursor + 1) % numLeagues
  }

  // Managers first so they are distributed as evenly as capacity allows, then
  // bots fill whatever is left.
  managers.forEach(place)
  bots.forEach(place)

  // Persist the league assignment (and keep the in-memory objects in sync).
  leagues.forEach((teamsOfLeague, league) => {
    teamsOfLeague.forEach(team => {
      team.league = league
      query(`UPDATE team
             SET league=${league}
             WHERE id = ${team.id}`)
    })
  })

  return leagues
}

/**
 * Generate the full home/away schedule for one league. Matchdays before
 * `forfeitBeforeGameDay` are inserted as `played=1, is_forfeit=1, 0:0`,
 * the rest as normal `played=0` games.
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @param {TeamType[]} teams
 * @param {Array} gamePlan
 * @param {number[]} leagueDayMap - Maps original league day index to actual game_day (with cup day gaps)
 * @param {number} forfeitBeforeGameDay - matchdays with actual game_day < this are inserted as forfeits
 * @returns {Promise<void>}
 */
async function _createGamesForLeague (season, level, league, teams, gamePlan, leagueDayMap, forfeitBeforeGameDay) {
  let gameDay = 0
  for (const gamesOfGameday of gamePlan) {
    for (const gamePair of gamesOfGameday) {
      const teamA = teams[gamePair[0] - 1]
      const teamB = teams[gamePair[1] - 1]
      const actualHomeDay = leagueDayMap ? leagueDayMap[gameDay] : gameDay
      const actualAwayDay = leagueDayMap ? leagueDayMap[gameDay + (teamsPerLeague - 1)] : gameDay + (teamsPerLeague - 1)
      const homeMatchDay = gameDay + 1
      const awayMatchDay = gameDay + teamsPerLeague
      await query('INSERT INTO game SET ?', _buildGame(season, level, league, teamA.id, teamB.id, actualHomeDay, forfeitBeforeGameDay, homeMatchDay))
      await query('INSERT INTO game SET ?', _buildGame(season, level, league, teamB.id, teamA.id, actualAwayDay, forfeitBeforeGameDay, awayMatchDay))
    }
    gameDay++
  }
}

/**
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @param {number} team1Id
 * @param {number} team2Id
 * @param {number} actualGameDay
 * @param {number} forfeitBeforeGameDay
 * @param {number} [matchDay] - User-facing 1-based league match day (1..2*(teamsPerLeague-1))
 * @returns {Game}
 */
export function _buildGame (season, level, league, team1Id, team2Id, actualGameDay, forfeitBeforeGameDay, matchDay) {
  const isForfeit = actualGameDay < forfeitBeforeGameDay
  /** @type {object} */
  const raw = {
    team_1_id: team1Id,
    team_2_id: team2Id,
    season,
    game_day: actualGameDay,
    level,
    league,
    played: isForfeit ? 1 : 0,
    is_forfeit: isForfeit ? 1 : 0,
    details: '{}'
  }
  if (typeof matchDay === 'number') {
    raw.match_day = matchDay
  }
  if (isForfeit) {
    raw.goals_team_1 = 0
    raw.goals_team_2 = 0
  }
  return new Game(raw)
}

/**
 * @returns {Promise<number>}
 */
async function _seasonForNewGames () {
  const [game] = await query('SELECT * FROM game g ORDER BY g.season DESC LIMIT 1')
  return (game?.season ?? -1) + 1
}

/**
 * @returns {Promise<number|undefined>}
 */
async function _latestSeason () {
  const [game] = await query('SELECT * FROM game g ORDER BY g.season DESC LIMIT 1')
  return game?.season
}

/**
 * @returns {Array<number>}
 */
function _calculateAmountPerLevel () {
  const amountTeamsPerLevel = []
  for (let level = 0; level < maxLevels; level++) {
    const amount = Math.pow(2, level) * teamsPerLeague
    amountTeamsPerLevel.push(amount)
  }
  return amountTeamsPerLevel
}

/**
 * Ensure every opened level is filled to its full quota of parallel leagues
 * (amountTeamsPerLevel[level] = 2^level * teamsPerLeague). New lower-tier
 * levels are only opened when the bottom two existing levels combined have
 * fewer than 20 free bot teams left for new users to pick from (i.e. the
 * choosable pool is running dry), or while the total team count is below
 * the minimumTeams floor. See `_nextLevelToFill`.
 * @returns {Promise<void>}
 */
async function _ajustAmountOfTeams () {
  const season = await _latestSeason() ?? 0
  let teams = await query('SELECT * FROM team WHERE is_system_team = 0')
  while (true) {
    const levelToFill = _nextLevelToFill(teams)
    if (levelToFill === -1) break
    if (levelToFill >= maxLevels) {
      throw new Error(`Cannot open level ${levelToFill}: exceeds maxLevels=${maxLevels}`)
    }
    const team = await _createRandomTeam(levelToFill)
    await Promise.all([...Array(18)].map((_, i) => _createRandomPlayer(team, i, season)))
    teams = await query('SELECT * FROM team WHERE is_system_team = 0')
  }
}

/**
 * Return the level for the next bot team to create:
 *  - the lowest opened level that is not yet full, OR
 *  - the next unopened level (when below `minimumTeams` floor, OR when the
 *    bottom two **user-pickable** opened levels combined have fewer than
 *    `freeBotsThreshold` free bot teams left for new users to pick from),
 *    OR
 *  - -1 otherwise.
 *
 * The free-bot trigger replaces the previous `users*2` rule: new lower
 * divisions only open when the existing bottom user-pickable divisions are
 * running out of choosable bot teams, not whenever the user count nudges
 * past the threshold. "User-pickable" = `level >= config.MIN_CHOOSABLE_LEVEL`
 * — picks from L0/L1 never happen, so counting their (always-full) bot
 * pool would mask a real shortage in the actual buffer levels.
 * @param {TeamType[]} teams
 * @param {number} [freeBotsThreshold]
 * @returns {number}
 */
export function _nextLevelToFill (teams, freeBotsThreshold = 20) {
  const counts = []
  const freeBotsByLevel = []
  let highestOpenedLevel = -1
  for (const team of teams) {
    const lvl = team.level ?? 0
    counts[lvl] = (counts[lvl] ?? 0) + 1
    if (lvl > highestOpenedLevel) highestOpenedLevel = lvl
    if (team.user_id == null) {
      freeBotsByLevel[lvl] = (freeBotsByLevel[lvl] ?? 0) + 1
    }
  }
  for (let level = 0; level <= highestOpenedLevel; level++) {
    const count = counts[level] ?? 0
    if (count > 0 && count < amountTeamsPerLevel[level]) return level
  }
  if (teams.length < minimumTeams) return highestOpenedLevel + 1
  const pickableLevels = []
  for (let l = config.MIN_CHOOSABLE_LEVEL; l <= highestOpenedLevel; l++) {
    if ((counts[l] ?? 0) > 0) pickableLevels.push(l)
  }
  const bottomTwoFree = pickableLevels.slice(-2)
    .reduce((acc, l) => acc + (freeBotsByLevel[l] ?? 0), 0)
  if (pickableLevels.length > 0 && bottomTwoFree < freeBotsThreshold) {
    return highestOpenedLevel + 1
  }
  return -1
}

/**
 * @param {number} level
 * @returns {Promise<Team>}
 */
async function _createRandomTeam (level) {
  const { shape, pattern, color, color2 } = generateRandomEmblem()
  const emblem = JSON.stringify({ shape, pattern, color, color2 })

  const team = new Team({
    name: _generateRandomTeamName(),
    level,
    balance: startBalance,
    formation: _generateRandomFormation(),
    color,
    emblem
  })
  const { insertId: teamId } = await query('INSERT INTO team SET ?', team)
  team.id = teamId
  const stadiumConfig = _getBotStadiumConfig(level)
  const stadium = new Stadium({
    team_id: team.id,
    name: defaultStadiumName(team.name),
    north_stand_roof: 0,
    south_stand_roof: 0,
    east_stand_roof: 0,
    west_stand_roof: 0,
    north_stand_size: stadiumConfig.n,
    south_stand_size: stadiumConfig.s,
    east_stand_size: stadiumConfig.e,
    west_stand_size: stadiumConfig.w,
    north_stand_price: 13,
    south_stand_price: 13,
    east_stand_price: 13,
    west_stand_price: 13,
    corner_ne_stand_size: 0,
    corner_nw_stand_size: 0,
    corner_se_stand_size: 0,
    corner_sw_stand_size: 0,
    corner_ne_stand_price: 13,
    corner_nw_stand_price: 13,
    corner_se_stand_price: 13,
    corner_sw_stand_price: 13,
    corner_ne_stand_roof: 0,
    corner_nw_stand_roof: 0,
    corner_se_stand_roof: 0,
    corner_sw_stand_roof: 0
  })
  await query('INSERT INTO stadium SET ?', stadium)
  await query('INSERT INTO building SET ?', {
    team_id: team.id,
    type: 'training_area',
    level: 1
  })
  await query('INSERT INTO building SET ?', {
    team_id: team.id,
    type: 'fitness_studio',
    level: 1
  })
  await query('INSERT INTO building SET ?', {
    team_id: team.id,
    type: 'youth_academy',
    level: 1
  })
  // The only building nobody starts with: level 0 means "buildable", and the row
  // has to exist for `upgradeBuilding` to find something to build on.
  await query('INSERT INTO building SET ?', {
    team_id: team.id,
    type: 'medical_practice',
    level: 0
  })
  return team
}

/**
 * @param {Team} team
 * @param {number} i
 * @param {number} season
 * @returns {Promise<void>}
 */
/**
 * Regenerate players, stadium and buildings for a team that was emptied (e.g. after account deletion).
 * @param {Team} team
 * @returns {Promise<void>}
 */
export async function regenerateTeamData (team) {
  const season = await _latestSeason() ?? 0
  const existingPlayers = await query('SELECT position FROM player WHERE team_id=?', [team.id])
  const targetSquadSize = 18
  const missing = targetSquadSize - existingPlayers.length
  if (missing > 0) {
    const positionsToCreate = _computeTopUpPositions(existingPlayers, team.formation, missing)
    await Promise.all(positionsToCreate.map(({ position, isStarter }) =>
      _createRandomPlayerForPosition(team, position, isStarter, season)
    ))
  }
  const [existingStadium] = await query('SELECT id FROM stadium WHERE team_id=?', [team.id])
  if (!existingStadium) {
    const stadiumConfig = _getBotStadiumConfig(team.level ?? 0)
    const stadium = new Stadium({
      team_id: team.id,
      name: defaultStadiumName(team.name),
      north_stand_roof: 0,
      south_stand_roof: 0,
      east_stand_roof: 0,
      west_stand_roof: 0,
      north_stand_size: stadiumConfig.n,
      south_stand_size: stadiumConfig.s,
      east_stand_size: stadiumConfig.e,
      west_stand_size: stadiumConfig.w,
      north_stand_price: 13,
      south_stand_price: 13,
      east_stand_price: 13,
      west_stand_price: 13
    })
    await query('INSERT INTO stadium SET ?', stadium)
  }
  const [{ count: buildingCount }] = await query('SELECT COUNT(*) AS count FROM building WHERE team_id=?', [team.id])
  if (buildingCount === 0) {
    await query('INSERT INTO building SET ?', { team_id: team.id, type: 'training_area', level: 1 })
    await query('INSERT INTO building SET ?', { team_id: team.id, type: 'fitness_studio', level: 1 })
    await query('INSERT INTO building SET ?', { team_id: team.id, type: 'youth_academy', level: 1 })
    await query('INSERT INTO building SET ?', { team_id: team.id, type: 'medical_practice', level: 0 })
  }
}

async function _createRandomPlayer (team, i, season) {
  const fixPosition = getPositionsOfFormation(team.formation)[i]
  await _createRandomPlayerForPosition(team, fixPosition ?? null, fixPosition !== undefined, season)
}

async function _createRandomPlayerForPosition (team, fixPosition, isStarter, season) {
  const age = Math.floor(Math.random() * 16) // have new players a bit younger, 16 means max 32 years old
  const carrierLength = 20 + Math.floor(Math.random() * 4)
  const levelRange = _getBotPlayerLevelRange(team.level ?? 0)
  const level = Math.floor(Math.random() * (levelRange.max - levelRange.min + 1)) + levelRange.min
  const player = new Player({
    hair_color: Math.floor(Math.random() * 7),
    skin_color: Math.floor(Math.random() * 4),
    team_id: team.id,
    name: (await generateRandomPlayerName()),
    carrier_start_season: season - age,
    carrier_end_season: season - age + carrierLength,
    level,
    in_game_position: isStarter && fixPosition ? fixPosition : '',
    position: fixPosition ?? _generateRandomPosition(),
    freshness: 1.0
  })
  await query('INSERT INTO player SET ?', player)
}

/**
 * Decide which positions to create when topping up a team to 18 players.
 * Prioritises filling missing formation slots so the user receives a playable lineup,
 * then fills the bench with random positions.
 * @param {{position: string}[]} existingPlayers
 * @param {string} formation
 * @param {number} missing
 * @returns {{position: string|null, isStarter: boolean}[]}
 */
export function _computeTopUpPositions (existingPlayers, formation, missing) {
  const formationPositions = getPositionsOfFormation(formation)
  const positionDeficit = {}
  for (const pos of formationPositions) {
    positionDeficit[pos] = (positionDeficit[pos] ?? 0) + 1
  }
  for (const p of existingPlayers) {
    if (positionDeficit[p.position] > 0) {
      positionDeficit[p.position] -= 1
    }
  }
  const starters = []
  for (const [pos, deficit] of Object.entries(positionDeficit)) {
    for (let i = 0; i < deficit; i++) {
      starters.push({ position: pos, isStarter: true })
    }
  }
  const result = starters.slice(0, missing)
  while (result.length < missing) {
    result.push({ position: null, isStarter: false })
  }
  return result
}

/**
 * @returns {Promise<boolean>}
 */
async function _newGamesNeeded () {
  const [{ amount }] = await query('SELECT COUNT(*) AS amount FROM game g WHERE g.played=0 AND (g.game_type=\'league\' OR g.game_type IS NULL)')
  return amount === 0
}

/**
 * @returns {string}
 */
function _generateRandomTeamName () {
  let prefix1, prefix2
  do {
    prefix1 = randomItem(clubPrefixes1)
    prefix2 = randomItem(clubPrefixes2)
  } while (!prefix1 && !prefix2)
  return `${prefix1} ${prefix2} ${randomItem(cityNames)}`.replace(/\s+/g, ' ').trim()
}

/**
 * @returns {Promise<string>}
 */
export async function generateRandomPlayerName () {
  const name = `${randomItem(playerNames).firstName} ${randomItem(playerNames).lastName}`
  const results = await query('SELECT * FROM player WHERE name=?', [name])
  if (results.length > 0) {
    console.log('Found player with same name...', name)
    return await generateRandomPlayerName()
  }
  return name
}

/**
 * @returns {string}
 */
function _generateRandomPosition () {
  return randomItem(Object.values(Position))
}

/**
 * @returns {string}
 */
function _generateRandomFormation () {
  return randomItem(Object.values(Formation))
}

/**
 * Returns the player level range for bot teams at a given league level.
 * Higher divisions (lower level numbers) get stronger players.
 * @param {number} leagueLevel
 * @returns {{min: number, max: number}}
 */
export function _getBotPlayerLevelRange (leagueLevel) {
  const ranges = [
    { min: 40, max: 60 }, // level 0
    { min: 30, max: 50 }, // level 1
    { min: 20, max: 40 }, // level 2
    { min: 10, max: 30 } //  level 3
  ]
  if (leagueLevel < ranges.length) return ranges[leagueLevel]
  return {
    min: Math.max(1, 50 - leagueLevel * 10),
    max: Math.max(10, 70 - leagueLevel * 10)
  }
}

/**
 * Returns stadium stand sizes for bot teams at a given league level.
 * Sized so that ticket income covers salary costs for levels 0-5.
 * @param {number} leagueLevel
 * @returns {{n: number, s: number, e: number, w: number}}
 */
export function _getBotStadiumConfig (leagueLevel) {
  const configs = [
    { n: 2600, s: 1300, e: 650, w: 650 },   // level 0
    { n: 1700, s: 850, e: 425, w: 425 },     // level 1
    { n: 1200, s: 600, e: 300, w: 300 },     // level 2
    { n: 750, s: 375, e: 188, w: 187 },      // level 3
    { n: 750, s: 375, e: 188, w: 187 },      // level 4
    { n: 500, s: 250, e: 125, w: 125 },      // level 5
    { n: 200, s: 200, e: 122, w: 122 }       // level 6
  ]
  if (leagueLevel < configs.length) return configs[leagueLevel]
  return { n: 200, s: 100, e: 100, w: 100 } // level 7+
}
