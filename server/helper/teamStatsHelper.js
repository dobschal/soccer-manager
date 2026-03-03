import { query } from '../lib/database.js'

/**
 * Calculate market value of a player at a given season
 * @param {Object} player
 * @param {number} season
 * @returns {number}
 */
function _getPlayerValue (player, season) {
  const age = season - player.carrier_start_season + 16
  let price = 50_000_000
  for (let a = 22; a < age; a++) price *= 0.75
  for (let l = 100; l > player.level; l -= 10) price *= 0.5
  return Math.floor(price)
}

/**
 * Calculate and cache team statistics for all teams that played on a given game day
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function cacheTeamStatsForGameDay (gameDay, season) {
  const games = await query(
    `SELECT * FROM game WHERE season=? AND game_day=? AND played=1
     AND (game_type='league' OR game_type IS NULL)`,
    [season, gameDay]
  )
  if (games.length === 0) return

  const teamIds = new Set()
  for (const game of games) {
    if (game.team_1_id) teamIds.add(game.team_1_id)
    if (game.team_2_id) teamIds.add(game.team_2_id)
  }

  const idList = [...teamIds].join(', ')
  const [teams, players, stadiums] = await Promise.all([
    query(`SELECT * FROM team WHERE id IN (${idList})`),
    query(`SELECT * FROM player WHERE team_id IN (${idList})`),
    query(`SELECT * FROM stadium WHERE team_id IN (${idList})`)
  ])

  const playersByTeam = {}
  for (const player of players) {
    if (!playersByTeam[player.team_id]) playersByTeam[player.team_id] = []
    playersByTeam[player.team_id].push(player)
  }

  const stadiumByTeam = {}
  for (const stadium of stadiums) {
    stadiumByTeam[stadium.team_id] = stadium
  }

  // Extract lineup strength and player count from game details
  const gameInfoByTeam = {}
  for (const game of games) {
    const details = game.details ? JSON.parse(game.details) : {}
    if (game.team_1_id) {
      gameInfoByTeam[game.team_1_id] = {
        strength: details.strengthTeamA || 0,
        playerCount: (details.playerTeamA || []).length
      }
    }
    if (game.team_2_id) {
      gameInfoByTeam[game.team_2_id] = {
        strength: details.strengthTeamB || 0,
        playerCount: (details.playerTeamB || []).length
      }
    }
  }

  for (const team of teams) {
    const teamPlayers = playersByTeam[team.id] || []
    const stadium = stadiumByTeam[team.id]
    const gameInfo = gameInfoByTeam[team.id] || { strength: 0, playerCount: 0 }

    const squadSize = teamPlayers.length
    const avgFreshness = teamPlayers.length > 0
      ? teamPlayers.reduce((sum, p) => sum + (parseFloat(p.freshness) || 0), 0) / teamPlayers.length
      : 0

    const stadiumSize = stadium
      ? (stadium.north_stand_size || 0) + (stadium.south_stand_size || 0) +
        (stadium.east_stand_size || 0) + (stadium.west_stand_size || 0)
      : 0

    const squadValue = teamPlayers.reduce((sum, p) => sum + _getPlayerValue(p, season), 0)

    const { playerCount, strength: totalStrength } = gameInfo
    const avgStrength = playerCount > 0 ? totalStrength / playerCount : 0

    await query(
      `INSERT INTO team_stats_cache
         (team_id, season, game_day, level, league, player_count, avg_strength, total_strength,
          squad_size, avg_freshness, stadium_size, squad_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         player_count=VALUES(player_count),
         avg_strength=VALUES(avg_strength),
         total_strength=VALUES(total_strength),
         squad_size=VALUES(squad_size),
         avg_freshness=VALUES(avg_freshness),
         stadium_size=VALUES(stadium_size),
         squad_value=VALUES(squad_value)`,
      [
        team.id, season, gameDay, team.level, team.league,
        playerCount, avgStrength.toFixed(2), totalStrength,
        squadSize, avgFreshness.toFixed(4),
        stadiumSize, squadValue
      ]
    )
  }
}

/**
 * Get cached team statistics for all teams in a league on a given game day
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @returns {Promise<Array>}
 */
export async function getTeamStatsFromCache (gameDay, season, level, league) {
  return await query(
    `SELECT tsc.*, t.name, t.emblem, t.color, t.user_id
     FROM team_stats_cache tsc
     JOIN team t ON t.id = tsc.team_id
     WHERE tsc.season=? AND tsc.game_day=? AND tsc.level=? AND tsc.league=?
     ORDER BY t.name`,
    [season, gameDay, level, league]
  )
}
