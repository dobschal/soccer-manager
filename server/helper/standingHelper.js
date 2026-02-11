import { query } from '../lib/database.js'
import { calculateStanding } from '../lib/util.js'

/**
 * Get cached standing from database
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @returns {Promise<Array|null>} Cached standing or null if not found
 */
export async function getCachedStanding (gameDay, season, level, league) {
  const [cached] = await query(
    'SELECT data FROM standing_cache WHERE season=? AND game_day=? AND level=? AND league=? LIMIT 1',
    [season, gameDay, level, league]
  )
  if (!cached) return null
  return JSON.parse(cached.data)
}

/**
 * Save standing to cache
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @param {Array} standing
 * @returns {Promise<void>}
 */
export async function saveStandingToCache (gameDay, season, level, league, standing) {
  const data = JSON.stringify(standing)
  await query(
    `INSERT INTO standing_cache (season, game_day, level, league, data)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE data=VALUES(data)`,
    [season, gameDay, level, league, data]
  )
}

/**
 * Calculate and cache standings for all leagues that played on this game day
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function cacheStandingsForGameDay (gameDay, season) {
  const t1 = Date.now()

  // Get all unique level/league combinations that had games this day
  const leagues = await query(
    `SELECT DISTINCT level, league FROM game WHERE season=? AND game_day=? AND played=1`,
    [season, gameDay]
  )

  for (const { level, league } of leagues) {
    // Get all played games for this league up to this game day
    const games = await query(
      `SELECT * FROM game
       WHERE season=? AND game_day<=? AND level=? AND league=? AND played=1`,
      [season, gameDay, level, league]
    )

    if (games.length === 0) continue

    // Get all teams in this league
    const teamIds = new Set()
    games.forEach(game => {
      teamIds.add(game.team_1_id)
      teamIds.add(game.team_2_id)
    })
    const teams = await query(
      `SELECT * FROM team WHERE id IN (${[...teamIds].join(', ')})`
    )

    // Calculate and cache standing
    const standing = calculateStanding(games, teams)
    await saveStandingToCache(gameDay, season, level, league, standing)
  }

  console.log(`Cached standings for ${leagues.length} leagues in ${Date.now() - t1}ms`)
}
