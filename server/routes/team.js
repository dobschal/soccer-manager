import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { getAveragePlanPriceOfPlayer } from '../helper/playerHelper.js'
import { cityNames, clubPrefixes1, clubPrefixes2 } from '../lib/name-library.js'
import { clearCacheByPrefix, CACHE_NAMESPACES } from '../lib/cache.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getTotalRoundsForSeason } from '../helper/cupHelper.js'

export default {

  /**
   * @param {Request} req
   * @returns {Promise<{user: Object, team: TeamType, players: Array<PlayerType>}>}
   */
  async getMyTeam (req) {
    const team = await getTeam(req)
    const players = await query('SELECT * FROM player WHERE team_id=?', team.id)
    delete req.user.password

    const { season } = await getGameDayAndSeason()
    const stats = await query(
      'SELECT player_id, SUM(goals) as goals, SUM(games_played) as games_played FROM player_season_stats WHERE season=? AND player_id IN (?) GROUP BY player_id',
      [season, players.map(p => p.id)]
    )
    const statsMap = new Map(stats.map(s => [s.player_id, s]))
    for (const player of players) {
      const s = statsMap.get(player.id)
      player.season_goals = s ? s.goals : 0
      player.season_games = s ? s.games_played : 0
    }

    return {
      user: req.user,
      team,
      players
    }
  },

  /**
   * @param {Request} req
   * @returns {Promise<{balance: number}>}
   */
  async getMyBalance (req) {
    const team = await getTeam(req)
    return { balance: team.balance }
  },

  /**
   * @param {string} color
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateColor (color, req) {
    const team = await getTeam(req)
    await query('UPDATE team SET color=? WHERE id=?', [color, team.id])
    return { success: true }
  },

  /**
   * @param {string} emblem - JSON string with emblem params (shape, pattern, color)
   * @param {string} color - Team color
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateEmblem (emblem, color, req) {
    const team = await getTeam(req)
    await query('UPDATE team SET emblem=?, color=? WHERE id=?', [emblem, color, team.id])
    return { success: true }
  },

  /**
   * @param {string} name - New team name
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateTeamName (name, req) {
    const team = await getTeam(req)
    const [existing] = await query('SELECT id FROM team WHERE name=? AND id<>?', [name, team.id])
    if (existing) {
      throw new BadRequestError('A team with this name already exists')
    }
    await query('UPDATE team SET name=? WHERE id=?', [name, team.id])
    // Clear season results cache since team name appears in results
    clearCacheByPrefix(CACHE_NAMESPACES.SEASON_RESULTS)
    // Clear standing cache in database since it stores serialized team names
    const { season } = await getGameDayAndSeason()
    await query('DELETE FROM standing_cache WHERE season=? AND level=? AND league=?', [season, team.level, team.league])
    return { success: true }
  },

  /**
   * @returns {Promise<{clubPrefixes1: Array<string>, clubPrefixes2: Array<string>, cityNames: Array<string>}>}
   */
  async getNameLibrary () {
    return {
      clubPrefixes1: [...new Set(clubPrefixes1)], // Remove duplicates
      clubPrefixes2: [...new Set(clubPrefixes2)], // Remove duplicates
      cityNames: [...new Set(cityNames)] // Remove duplicates
    }
  },

  /**
   * @param {number} teamId
   * @returns {Promise<TeamType>}
   */
  async getTeamById (teamId) {
    return await getTeamById(teamId)
  },

  /**
   * @param {number} teamId
   * @returns {Promise<{team: TeamType, players: Array<PlayerType>, user: Object|undefined}>}
   */
  async getTeam (teamId) {
    const team = await getTeamById(teamId)
    if (!team) {
      return {
        team: null,
        players: [],
        user: undefined
      }
    }
    const players = await query('SELECT * FROM player WHERE team_id=?', [team.id])
    let user
    if (team.user_id) {
      const users = await query('SELECT * FROM user WHERE id=? LIMIT 1', [team.user_id])
      user = users[0]
      if (user) {
        delete user.password
      }
    }
    return {
      team,
      players,
      user
    }
  },

  /**
   * @param {number} teamId
   * @returns {Promise<{value: number}>}
   */
  async getTeamValue (teamId) {
    const players = await query('SELECT * FROM player WHERE team_id=?', [teamId])
    const values = await Promise.all(players.map(p => getAveragePlanPriceOfPlayer(p)))
    const totalValue = values.reduce((sum, v) => sum + v, 0)
    return { value: totalValue }
  },

  /**
   * @param {Array<PlayerType>} players
   * @param {string} formation
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async saveLineup (players, formation, req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const playersFromDb = await query('SELECT * FROM player WHERE team_id=?', team.id)
    for (const playerFromRequest of players) {
      const playerFromDb = playersFromDb.find(playerFromDb => playerFromRequest.id === playerFromDb.id)
      if (!playerFromDb) throw new BadRequestError('Unknown player...')
      playerFromDb.in_game_position = playerFromRequest.in_game_position
      await query('UPDATE player SET in_game_position=? WHERE id=?', [playerFromDb.in_game_position, playerFromDb.id])
    }
    await query('UPDATE team SET formation=? WHERE id=?', [formation, team.id])
    return { success: true }
  },

  /**
   * @param {string} passStyle - 'short', 'mixed', or 'long'
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updatePassStyle (passStyle, req) {
    const validStyles = ['short', 'mixed', 'long']
    if (!validStyles.includes(passStyle)) {
      throw new BadRequestError('Invalid pass style')
    }
    const team = await getTeam(req)
    await query('UPDATE team SET pass_style=? WHERE id=?', [passStyle, team.id])
    return { success: true }
  },

  /**
   * @param {string} playStyle - 'aggressive', 'normal', or 'friendly'
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updatePlayStyle (playStyle, req) {
    const validStyles = ['aggressive', 'normal', 'friendly']
    if (!validStyles.includes(playStyle)) {
      throw new BadRequestError('Invalid play style')
    }
    const team = await getTeam(req)
    await query('UPDATE team SET play_style=? WHERE id=?', [playStyle, team.id])
    return { success: true }
  },

  /**
   * @param {string} attackMode - 'offensive', 'balanced', or 'defensive'
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateAttackMode (attackMode, req) {
    const validModes = ['offensive', 'balanced', 'defensive']
    if (!validModes.includes(attackMode)) {
      throw new BadRequestError('Invalid attack mode')
    }
    const team = await getTeam(req)
    await query('UPDATE team SET attack_mode=? WHERE id=?', [attackMode, team.id])
    return { success: true }
  },

  /**
   * @param {Array<{playerId: number, sortIndex: number}>} sortData
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async saveBenchSortOrder (sortData, req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    if (!team) throw new BadRequestError('No team found')
    const playersFromDb = await query('SELECT id FROM player WHERE team_id=?', [team.id])
    const validIds = new Set(playersFromDb.map(p => p.id))
    for (const { playerId, sortIndex } of sortData) {
      if (!validIds.has(playerId)) throw new BadRequestError('Unknown player...')
      await query('UPDATE player SET sort_index=? WHERE id=?', [sortIndex, playerId])
    }
    return { success: true }
  },

  /**
   * Get transfer history for a specific team
   * @param {number} teamId
   * @returns {Promise<{transfers: Array}>}
   */
  async getTeamTransferHistory (teamId) {
    const transfers = await query(`
      SELECT th.*,
             p.name as player_name, p.position as player_position,
             t1.name as from_team_name, t1.color as from_team_color, t1.emblem as from_team_emblem,
             t2.name as to_team_name, t2.color as to_team_color, t2.emblem as to_team_emblem
      FROM trade_history th
      JOIN player p ON p.id = th.player_id
      LEFT JOIN team t1 ON t1.id = th.from_team_id
      LEFT JOIN team t2 ON t2.id = th.to_team_id
      WHERE th.from_team_id = ? OR th.to_team_id = ?
      ORDER BY th.created_at DESC
      LIMIT 50
    `, [teamId, teamId])

    return {
      transfers: transfers.map(t => ({
        id: t.id,
        playerId: t.player_id,
        playerName: t.player_name,
        playerPosition: t.player_position,
        fromTeamId: t.from_team_id,
        fromTeamName: t.from_team_name,
        fromTeam: t.from_team_id ? { id: t.from_team_id, name: t.from_team_name, color: t.from_team_color, emblem: t.from_team_emblem } : null,
        toTeamId: t.to_team_id,
        toTeamName: t.to_team_name,
        toTeam: t.to_team_id ? { id: t.to_team_id, name: t.to_team_name, color: t.to_team_color, emblem: t.to_team_emblem } : null,
        price: t.price,
        gameDay: t.game_day,
        season: t.season,
        createdAt: t.created_at
      }))
    }
  },

  /**
   * Get season history for a specific team (league positions and cup results)
   * @param {number} teamId
   * @returns {Promise<{seasons: Array}>}
   */
  async getTeamSeasonHistory (teamId) {
    const team = await getTeamById(teamId)
    if (!team) {
      return { seasons: [] }
    }

    // Get current season to exclude it (only show completed seasons)
    const { season: currentSeason } = await getGameDayAndSeason()

    // Get all completed seasons this team has played in (exclude current season)
    // Filter to league games only — cup games have level=0/league=0 which would override the real values
    const seasonData = await query(`
      SELECT DISTINCT season, level, league
      FROM game
      WHERE (team_1_id = ? OR team_2_id = ?) AND played = 1 AND season < ?
        AND (game_type = 'league' OR game_type IS NULL)
      ORDER BY season DESC
    `, [teamId, teamId, currentSeason])

    const seasons = []
    const processedSeasons = new Set()

    for (const row of seasonData) {
      if (processedSeasons.has(row.season)) continue
      processedSeasons.add(row.season)

      // Get final standing for this season (game day 33 or last played day)
      const [lastGame] = await query(`
        SELECT MAX(game_day) as lastGameDay
        FROM game
        WHERE season = ? AND level = ? AND league = ? AND played = 1
          AND (game_type = 'league' OR game_type IS NULL)
      `, [row.season, row.level, row.league])

      const lastGameDay = lastGame?.lastGameDay || 33

      // Get all games for this team in this season to calculate standing
      const games = await query(`
        SELECT * FROM game
        WHERE season = ? AND level = ? AND league = ? AND played = 1
          AND (game_type = 'league' OR game_type IS NULL)
          AND game_day <= ?
      `, [row.season, row.level, row.league, lastGameDay])

      // Calculate standing
      const teams = await query(`
        SELECT DISTINCT t.* FROM team t
        JOIN game g ON (g.team_1_id = t.id OR g.team_2_id = t.id)
        WHERE g.season = ? AND g.level = ? AND g.league = ?
          AND (g.game_type = 'league' OR g.game_type IS NULL)
      `, [row.season, row.level, row.league])

      const standing = calculateStandingForTeam(games, teams, teamId)

      // Get cup result for this season
      const cupGames = await query(`
        SELECT g.*,
               t1.name as team1Name, t2.name as team2Name
        FROM game g
        JOIN team t1 ON t1.id = g.team_1_id
        JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.game_type = 'cup' AND g.season = ?
          AND (g.team_1_id = ? OR g.team_2_id = ?)
        ORDER BY g.cup_round ASC
      `, [row.season, teamId, teamId])

      let cupResult = null
      if (cupGames.length > 0) {
        // cup_round uses descending numbering (64→32→16→8→4→2→1), so the
        // deepest round reached is the smallest cup_round value (first in ASC order)
        const deepestCupGame = cupGames[0]
        const isWinner = deepestCupGame.played === 1 && (
          (deepestCupGame.team_1_id === teamId && deepestCupGame.goals_team_1 > deepestCupGame.goals_team_2) ||
          (deepestCupGame.team_2_id === teamId && deepestCupGame.goals_team_2 > deepestCupGame.goals_team_1)
        )
        const roundReached = deepestCupGame.cup_round
        const totalRounds = await getTotalRoundsForSeason(row.season)

        cupResult = {
          roundReached,
          totalRounds,
          isWinner: isWinner && roundReached === 1,
          gamesPlayed: cupGames.filter(g => g.played === 1).length
        }
      }

      seasons.push({
        season: row.season,
        level: row.level,
        league: row.league,
        position: standing.position,
        played: standing.played,
        won: standing.won,
        drawn: standing.drawn,
        lost: standing.lost,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        points: standing.points,
        cupResult
      })
    }

    return { seasons }
  }
}

/**
 * Calculate standing position for a specific team
 * @param {Array} games
 * @param {Array} teams
 * @param {number} teamId
 * @returns {Object}
 */
function calculateStandingForTeam (games, teams, teamId) {
  const standings = {}

  // Initialize standings for all teams
  for (const team of teams) {
    standings[team.id] = {
      teamId: team.id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0
    }
  }

  // Calculate standings from games
  for (const game of games) {
    if (!standings[game.team_1_id] || !standings[game.team_2_id]) continue

    standings[game.team_1_id].played++
    standings[game.team_2_id].played++
    standings[game.team_1_id].goalsFor += game.goals_team_1
    standings[game.team_1_id].goalsAgainst += game.goals_team_2
    standings[game.team_2_id].goalsFor += game.goals_team_2
    standings[game.team_2_id].goalsAgainst += game.goals_team_1

    if (game.goals_team_1 > game.goals_team_2) {
      standings[game.team_1_id].won++
      standings[game.team_1_id].points += 3
      standings[game.team_2_id].lost++
    } else if (game.goals_team_2 > game.goals_team_1) {
      standings[game.team_2_id].won++
      standings[game.team_2_id].points += 3
      standings[game.team_1_id].lost++
    } else {
      standings[game.team_1_id].drawn++
      standings[game.team_2_id].drawn++
      standings[game.team_1_id].points++
      standings[game.team_2_id].points++
    }
  }

  // Sort standings
  const sorted = Object.values(standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const gdA = a.goalsFor - a.goalsAgainst
    const gdB = b.goalsFor - b.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.goalsFor - a.goalsFor
  })

  // Find position of the team
  const position = sorted.findIndex(s => s.teamId === teamId) + 1
  const teamStanding = standings[teamId] || {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0
  }

  return {
    position,
    ...teamStanding
  }
}
