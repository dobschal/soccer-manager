import { query } from '../lib/database.js'

/**
 * Get top scorers from cached stats
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @param {number} limit
 * @returns {Promise<Array<{id: number, name: string, goals: number, team: object}>>}
 */
export async function getTopScorers (season, level, league, limit = 10) {
  const topScorers = await query(
    `SELECT
        pss.player_id,
        pss.goals,
        p.name,
        p.level,
        p.position,
        p.carrier_start_season,
        p.hair_color,
        p.skin_color,
        t.id as team_id,
        t.name as team_name,
        t.color as team_color,
        t.emblem as team_emblem
     FROM player_season_stats pss
     JOIN player p ON p.id = pss.player_id
     JOIN team t ON t.id = p.team_id
     WHERE pss.season = ? AND pss.level = ? AND pss.league = ? AND pss.goals > 0
     ORDER BY pss.goals DESC
     LIMIT ?`,
    [season, level, league, limit]
  )

  return topScorers.map(row => ({
    id: row.player_id,
    name: row.name,
    level: row.level,
    position: row.position,
    carrier_start_season: row.carrier_start_season,
    hair_color: row.hair_color,
    skin_color: row.skin_color,
    goals: row.goals,
    team: {
      id: row.team_id,
      name: row.team_name,
      color: row.team_color,
      emblem: row.team_emblem
    }
  }))
}

/**
 * Cache player stats for all leagues that played on this game day
 * Processes game details to extract goals, yellow cards, and red cards
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function cachePlayerStatsForGameDay (gameDay, season) {
  const t1 = Date.now()

  // Get all games played this game day with their details
  const games = await query(
    `SELECT id, level, league, details, team_1_id, team_2_id
     FROM game
     WHERE season = ? AND game_day = ? AND played = 1 AND details IS NOT NULL`,
    [season, gameDay]
  )

  if (games.length === 0) {
    console.log('No games to process for player stats')
    return
  }

  // Collect stats from all games
  // Key: `${playerId}_${level}_${league}`, Value: { goals, yellowCards, redCards, gamesPlayed }
  const statsMap = new Map()

  for (const game of games) {
    if (!game.details) continue

    let details
    try {
      details = JSON.parse(game.details)
    } catch {
      console.warn(`Failed to parse game details for game ${game.id}`)
      continue
    }

    if (!details || !details.log || !Array.isArray(details.log)) continue

    const { level, league } = game

    // Track which players participated in this game
    const playersInGame = new Set()

    // Get player IDs from playerTeamA and playerTeamB
    if (details.playerTeamA) {
      details.playerTeamA.forEach(p => playersInGame.add(p.id))
    }
    if (details.playerTeamB) {
      details.playerTeamB.forEach(p => playersInGame.add(p.id))
    }

    // Process log events for goals, yellow cards, and red cards
    for (const event of details.log) {
      if (event.goal && event.player) {
        const key = `${event.player}_${level}_${league}`
        const stats = statsMap.get(key) || { goals: 0, yellowCards: 0, redCards: 0, gamesPlayed: 0, level, league }
        stats.goals++
        statsMap.set(key, stats)
      }
      if (event.yellowCard && event.player) {
        const key = `${event.player}_${level}_${league}`
        const stats = statsMap.get(key) || { goals: 0, yellowCards: 0, redCards: 0, gamesPlayed: 0, level, league }
        stats.yellowCards++
        statsMap.set(key, stats)
      }
      if (event.redCard && event.player) {
        const key = `${event.player}_${level}_${league}`
        const stats = statsMap.get(key) || { goals: 0, yellowCards: 0, redCards: 0, gamesPlayed: 0, level, league }
        stats.redCards++
        statsMap.set(key, stats)
      }
    }

    // Mark games played for all players in this game
    for (const playerId of playersInGame) {
      const key = `${playerId}_${level}_${league}`
      const stats = statsMap.get(key) || { goals: 0, yellowCards: 0, redCards: 0, gamesPlayed: 0, level, league }
      stats.gamesPlayed++
      statsMap.set(key, stats)
    }
  }

  // Upsert stats into database
  const updatePromises = []
  for (const [key, stats] of statsMap) {
    const [playerId] = key.split('_')
    updatePromises.push(
      query(
        `INSERT INTO player_season_stats
         (player_id, season, level, league, goals, yellow_cards, red_cards, games_played, last_updated_game_day)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           goals = goals + VALUES(goals),
           yellow_cards = yellow_cards + VALUES(yellow_cards),
           red_cards = red_cards + VALUES(red_cards),
           games_played = games_played + VALUES(games_played),
           last_updated_game_day = VALUES(last_updated_game_day)`,
        [playerId, season, stats.level, stats.league, stats.goals, stats.yellowCards, stats.redCards, stats.gamesPlayed, gameDay]
      )
    )
  }

  await Promise.all(updatePromises)
  console.log(`Cached player stats for ${statsMap.size} players in ${Date.now() - t1}ms`)
}
