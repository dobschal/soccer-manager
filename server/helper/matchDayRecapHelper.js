import { query } from '../lib/database.js'
import { MatchDayRecap } from '../entities/matchDayRecap.js'
import { calculateStanding } from '../lib/util.js'
import { t, getSupportedLocales } from '../i18n/index.js'

/**
 * Generate one recap article per league for a completed matchday.
 * Replaces the previous news-per-event system.
 *
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function generateMatchDayRecapsForGameDay (gameDay, season) {
  console.log(`Generating match day recaps for season ${season}, game day ${gameDay}...`)

  const leagues = await query(
    `SELECT DISTINCT level, league
       FROM game
      WHERE game_day=? AND season=? AND played=1
        AND (game_type='league' OR game_type IS NULL)`,
    [gameDay, season]
  )

  for (const { level, league } of leagues) {
    await _generateRecapForLeague(gameDay, season, level, league)
  }

  console.log('Match day recap generation complete.')
}

/**
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 */
async function _generateRecapForLeague (gameDay, season, level, league) {
  const stats = await _collectMatchDayStats(gameDay, season, level, league)
  if (!stats || stats.gameCount === 0) return

  const locales = getSupportedLocales()
  for (const locale of locales) {
    const { title, text } = _composeRecap(stats, locale, gameDay)
    const raw = {
      game_day: gameDay,
      season,
      level,
      league,
      locale,
      title,
      text
    }
    if (stats.imagePlayerId != null) raw.image_player_id = stats.imagePlayerId
    if (stats.imageTeamId != null) raw.image_team_id = stats.imageTeamId
    const recap = new MatchDayRecap(raw)
    await query(
      `INSERT INTO match_day_recap SET ?
       ON DUPLICATE KEY UPDATE title=VALUES(title), text=VALUES(text),
         image_player_id=VALUES(image_player_id), image_team_id=VALUES(image_team_id)`,
      recap
    )
  }
}

/**
 * Aggregate every interesting fact for a league on a given match day.
 * Exported for tests.
 *
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @returns {Promise<MatchDayStats|null>}
 */
export async function _collectMatchDayStats (gameDay, season, level, league) {
  const games = await query(
    `SELECT g.*, t1.name AS team1_name, t2.name AS team2_name
       FROM game g
       JOIN team t1 ON t1.id = g.team_1_id
       JOIN team t2 ON t2.id = g.team_2_id
      WHERE g.game_day=? AND g.season=? AND g.level=? AND g.league=? AND g.played=1
        AND (g.game_type='league' OR g.game_type IS NULL)`,
    [gameDay, season, level, league]
  )
  if (games.length === 0) return null

  let totalGoals = 0
  let draws = 0
  let redCards = 0
  let injuries = 0
  let biggestWin = null
  /** @type {Map<number, {goals: number, name: string, teamId: number}>} */
  const scorerStats = new Map()

  for (const game of games) {
    const g1 = game.goals_team_1 ?? 0
    const g2 = game.goals_team_2 ?? 0
    totalGoals += g1 + g2
    if (g1 === g2) draws++

    const diff = Math.abs(g1 - g2)
    if (g1 !== g2 && (!biggestWin || diff > biggestWin.diff)) {
      const team1Won = g1 > g2
      biggestWin = {
        diff,
        winnerName: team1Won ? game.team1_name : game.team2_name,
        loserName: team1Won ? game.team2_name : game.team1_name,
        winnerId: team1Won ? game.team_1_id : game.team_2_id,
        goalsFor: Math.max(g1, g2),
        goalsAgainst: Math.min(g1, g2)
      }
    }

    const details = _parseDetails(game.details)
    if (details) {
      if (Array.isArray(details.sentOffPlayerIds)) redCards += details.sentOffPlayerIds.length
      if (Array.isArray(details.injuries)) injuries += details.injuries.length
      if (Array.isArray(details.log)) {
        for (const event of details.log) {
          if (event && event.goal && event.player) {
            const existing = scorerStats.get(event.player) || { goals: 0, name: null, teamId: event.teamA ? game.team_1_id : game.team_2_id }
            existing.goals++
            scorerStats.set(event.player, existing)
          }
        }
      }
    }
  }

  // Fill in scorer names (single query for all scorer ids)
  let topScorer = null
  if (scorerStats.size > 0) {
    const ids = [...scorerStats.keys()]
    const players = await query(
      `SELECT id, name, team_id FROM player WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids
    )
    const nameById = new Map(players.map(p => [p.id, p]))
    for (const [playerId, info] of scorerStats.entries()) {
      const dbPlayer = nameById.get(playerId)
      if (dbPlayer) {
        info.name = dbPlayer.name
        info.teamId = dbPlayer.team_id ?? info.teamId
      }
    }
    for (const [playerId, info] of scorerStats.entries()) {
      if (!info.name) continue
      if (!topScorer || info.goals > topScorer.goals) {
        topScorer = { playerId, goals: info.goals, name: info.name, teamId: info.teamId }
      }
    }
  }

  // Find team name for top scorer
  if (topScorer && topScorer.teamId) {
    const teamForScorer = games.find(g => g.team_1_id === topScorer.teamId || g.team_2_id === topScorer.teamId)
    if (teamForScorer) {
      topScorer.teamName = teamForScorer.team_1_id === topScorer.teamId
        ? teamForScorer.team1_name
        : teamForScorer.team2_name
    }
  }

  // Detect the biggest upset by comparing positions in the previous matchday's standing.
  // (Only meaningful from matchday 2 onwards.)
  const upset = await _findBiggestUpset(games, gameDay, season, level, league)

  // Decide which image to feature:
  // 1. Top scorer player if they scored 2+ goals
  // 2. Otherwise winning team of the biggest goal-diff game
  let imagePlayerId = null
  let imageTeamId = null
  if (topScorer && topScorer.goals >= 2) {
    imagePlayerId = topScorer.playerId
  } else if (biggestWin) {
    imageTeamId = biggestWin.winnerId
  } else if (topScorer) {
    imagePlayerId = topScorer.playerId
  }

  return {
    gameCount: games.length,
    totalGoals,
    draws,
    redCards,
    injuries,
    biggestWin,
    topScorer,
    upset,
    imagePlayerId,
    imageTeamId
  }
}

/**
 * Compose the recap title + body from i18n fragments based on what happened.
 *
 * @param {MatchDayStats} stats
 * @param {string} locale
 * @param {number} gameDay
 * @returns {{title: string, text: string}}
 */
function _composeRecap (stats, locale, gameDay) {
  const matchDay = gameDay + 1
  const goalsPerGame = stats.totalGoals / Math.max(1, stats.gameCount)
  const introKey = goalsPerGame >= 4
    ? 'recap.intro.highScoring'
    : goalsPerGame <= 1.5
      ? 'recap.intro.lowScoring'
      : 'recap.intro.balanced'

  const parts = []
  parts.push(t(introKey, { matchDay, gameCount: stats.gameCount, totalGoals: stats.totalGoals }, locale))

  if (stats.biggestWin && stats.biggestWin.diff >= 2) {
    parts.push(t('recap.biggestWin', {
      winnerName: stats.biggestWin.winnerName,
      loserName: stats.biggestWin.loserName,
      goalsFor: stats.biggestWin.goalsFor,
      goalsAgainst: stats.biggestWin.goalsAgainst
    }, locale))
  }

  if (stats.topScorer && stats.topScorer.teamName) {
    const key = stats.topScorer.goals === 1 ? 'recap.topScorer.one' : 'recap.topScorer.many'
    parts.push(t(key, {
      playerName: stats.topScorer.name,
      teamName: stats.topScorer.teamName,
      goals: stats.topScorer.goals
    }, locale))
  }

  if (stats.upset) {
    parts.push(t('recap.upset', {
      winnerName: stats.upset.winnerName,
      loserName: stats.upset.loserName,
      winnerPlace: stats.upset.winnerPlace,
      loserPlace: stats.upset.loserPlace
    }, locale))
  }

  if (stats.redCards > 0) {
    const key = stats.redCards === 1 ? 'recap.redCards.one' : 'recap.redCards.many'
    parts.push(t(key, { count: stats.redCards }, locale))
  }

  if (stats.injuries > 0) {
    const key = stats.injuries === 1 ? 'recap.injuries.one' : 'recap.injuries.many'
    parts.push(t(key, { count: stats.injuries }, locale))
  }

  if (stats.draws > 0) {
    const key = stats.draws === 1 ? 'recap.draws.one' : 'recap.draws.many'
    parts.push(t(key, { count: stats.draws }, locale))
  }

  const outroKey = stats.upset || (stats.biggestWin && stats.biggestWin.diff >= 4)
    ? 'recap.outro.shaken'
    : 'recap.outro.predictable'
  parts.push(t(outroKey, {}, locale))

  return {
    title: t('recap.title', { matchDay }, locale),
    text: parts.join(' ')
  }
}

/**
 * Compare the previous matchday's standing with this matchday's results to
 * find the biggest "upset" — i.e. the largest standings-position gap where a
 * lower-ranked team beat a higher-ranked team.
 *
 * @param {Array<object>} games
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @returns {Promise<{winnerName: string, loserName: string, winnerPlace: number, loserPlace: number} | null>}
 */
async function _findBiggestUpset (games, gameDay, season, level, league) {
  if (gameDay < 2) return null
  const prevGames = await query(
    `SELECT * FROM game
      WHERE game_day<? AND season=? AND level=? AND league=? AND played=1
        AND (game_type='league' OR game_type IS NULL)`,
    [gameDay, season, level, league]
  )
  if (prevGames.length === 0) return null

  const teamIds = new Set()
  for (const g of [...prevGames, ...games]) {
    teamIds.add(g.team_1_id)
    teamIds.add(g.team_2_id)
  }
  if (teamIds.size === 0) return null

  const teams = await query(
    `SELECT id, name FROM team WHERE id IN (${[...teamIds].map(() => '?').join(', ')})`,
    [...teamIds]
  )
  const standing = calculateStanding(prevGames, teams)
  standing.sort((a, b) => {
    const diff = b.points - a.points
    if (diff !== 0) return diff
    return (b.goals - b.against) - (a.goals - a.against)
  })
  const placeByTeamId = new Map(standing.map((s, i) => [s.team.id, i + 1]))

  let best = null
  for (const game of games) {
    const g1 = game.goals_team_1 ?? 0
    const g2 = game.goals_team_2 ?? 0
    if (g1 === g2) continue
    const team1Won = g1 > g2
    const winnerId = team1Won ? game.team_1_id : game.team_2_id
    const loserId = team1Won ? game.team_2_id : game.team_1_id
    const winnerPlace = placeByTeamId.get(winnerId)
    const loserPlace = placeByTeamId.get(loserId)
    if (!winnerPlace || !loserPlace) continue
    // Lower-ranked team beat higher-ranked team — bigger gap = bigger upset.
    const gap = winnerPlace - loserPlace
    if (gap < 3) continue
    if (!best || gap > best.gap) {
      best = {
        gap,
        winnerPlace,
        loserPlace,
        winnerName: team1Won ? game.team1_name : game.team2_name,
        loserName: team1Won ? game.team2_name : game.team1_name
      }
    }
  }
  return best
}

/**
 * @param {unknown} raw
 * @returns {object | null}
 */
function _parseDetails (raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * @typedef {object} MatchDayStats
 * @property {number} gameCount
 * @property {number} totalGoals
 * @property {number} draws
 * @property {number} redCards
 * @property {number} injuries
 * @property {{diff: number, winnerName: string, loserName: string, winnerId: number, goalsFor: number, goalsAgainst: number} | null} biggestWin
 * @property {{playerId: number, goals: number, name: string, teamId: number, teamName?: string} | null} topScorer
 * @property {{winnerName: string, loserName: string, winnerPlace: number, loserPlace: number} | null} upset
 * @property {number | null} imagePlayerId
 * @property {number | null} imageTeamId
 */

/**
 * Get the recap stored for a given league + match day + locale.
 *
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @param {string} locale
 * @returns {Promise<MatchDayRecapType | null>}
 */
export async function getMatchDayRecap (gameDay, season, level, league, locale = 'en') {
  const rows = await query(
    `SELECT * FROM match_day_recap
      WHERE game_day=? AND season=? AND level=? AND league=? AND locale=?
      LIMIT 1`,
    [gameDay, season, level, league, locale]
  )
  return rows[0] ?? null
}
