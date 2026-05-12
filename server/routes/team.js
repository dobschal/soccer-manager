import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { getAveragePlanPriceOfPlayer } from '../helper/playerHelper.js'
import { cityNames, clubPrefixes1, clubPrefixes2 } from '../lib/name-library.js'
import { clearCacheByPrefix, CACHE_NAMESPACES } from '../lib/cache.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getTotalRounds } from '../helper/cupHelper.js'
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
      players,
      isAdmin: !!req.user?.is_admin
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

    // Clear captain if the captain was removed from the lineup
    let captainCleared = false
    if (team.captain_id) {
      const captainInLineup = players.find(p => p.id === team.captain_id && p.in_game_position)
      if (!captainInLineup) {
        await query('UPDATE team SET captain_id=NULL WHERE id=?', [team.id])
        captainCleared = true
      }
    }

    return { success: true, captainCleared }
  },

  /**
   * @param {number|null} playerId - The player id to set as captain, or null to clear
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async setCaptain (playerId, req) {
    const team = await getTeam(req)
    if (playerId !== null) {
      // Verify the player belongs to this team and is in the lineup
      const [player] = await query(
        'SELECT * FROM player WHERE id=? AND team_id=? LIMIT 1',
        [playerId, team.id]
      )
      if (!player) throw new BadRequestError('Player not found in your team')
      if (!player.in_game_position) throw new BadRequestError('Captain must be in the lineup')
    }
    await query('UPDATE team SET captain_id=? WHERE id=?', [playerId, team.id])
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
   * Save bench positions (GK, DEF, MID, ATT slots)
   * @param {Array<{playerId: number, benchPosition: string, substitutionMode?: string}>} benchData
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async saveBench (benchData, req) {
    const team = await getTeam(req)
    const playersFromDb = await query('SELECT * FROM player WHERE team_id=?', [team.id])
    const validIds = new Set(playersFromDb.map(p => p.id))
    const validPositions = ['BENCH_GK', 'BENCH_DEF', 'BENCH_MID', 'BENCH_ATT']
    const validModes = ['always', 'injury_only', 'leading', 'trailing']

    // Clear all existing bench positions
    await query('UPDATE player SET bench_position=NULL WHERE team_id=?', [team.id])

    for (const { playerId, benchPosition, substitutionMode } of benchData) {
      if (!validIds.has(playerId)) throw new BadRequestError('Unknown player...')
      if (!validPositions.includes(benchPosition)) throw new BadRequestError('Invalid bench position')
      const mode = substitutionMode ?? 'injury_only'
      if (!validModes.includes(mode)) throw new BadRequestError('Invalid substitution mode')
      const player = playersFromDb.find(p => p.id === playerId)
      if (player.is_suspended || player.is_injured) throw new BadRequestError('Player is unavailable')
      await query('UPDATE player SET bench_position=?, bench_substitution_mode=? WHERE id=?', [benchPosition, mode, playerId])
    }

    return { success: true }
  },

  /**
   * Update only the substitution mode for a single bench player.
   * @param {number} playerId
   * @param {string} substitutionMode
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateBenchSubstitutionMode (playerId, substitutionMode, req) {
    const team = await getTeam(req)
    const validModes = ['always', 'injury_only', 'leading', 'trailing']
    if (!validModes.includes(substitutionMode)) throw new BadRequestError('Invalid substitution mode')
    const [player] = await query('SELECT id FROM player WHERE id=? AND team_id=?', [playerId, team.id])
    if (!player) throw new BadRequestError('Unknown player...')
    await query('UPDATE player SET bench_substitution_mode=? WHERE id=?', [substitutionMode, playerId])
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
   * Get transfer history for a specific team (trades + free agent signings)
   * @param {number} teamId
   * @returns {Promise<{transfers: Array}>}
   */
  async getTeamTransferHistory (teamId) {
    const [transfers, hiredEntries, firedEntries] = await Promise.all([
      query(`
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
      `, [teamId, teamId]),
      query(`
        SELECT ph.player_id, ph.season, ph.game_day, ph.created_at,
               p.name as player_name, p.position as player_position
        FROM player_history ph
        JOIN player p ON p.id = ph.player_id
        WHERE ph.type = 'HIRED' AND p.team_id = ?
        ORDER BY ph.created_at DESC
      `, [teamId]),
      query(`
        SELECT ph.player_id, ph.season, ph.game_day, ph.created_at,
               p.name as player_name, p.position as player_position
        FROM player_history ph
        JOIN player p ON p.id = ph.player_id
        JOIN team t ON t.name = ph.value
        WHERE ph.type = 'FIRED' AND t.id = ?
        ORDER BY ph.created_at DESC
      `, [teamId])
    ])

    const tradePlayerIds = new Set(transfers.map(tr => tr.player_id))

    const mapped = transfers.map(tr => ({
      id: tr.id,
      playerId: tr.player_id,
      playerName: tr.player_name,
      playerPosition: tr.player_position,
      fromTeamId: tr.from_team_id,
      fromTeamName: tr.from_team_name,
      fromTeam: tr.from_team_id ? { id: tr.from_team_id, name: tr.from_team_name, color: tr.from_team_color, emblem: tr.from_team_emblem } : null,
      toTeamId: tr.to_team_id,
      toTeamName: tr.to_team_name,
      toTeam: tr.to_team_id ? { id: tr.to_team_id, name: tr.to_team_name, color: tr.to_team_color, emblem: tr.to_team_emblem } : null,
      price: tr.price,
      gameDay: tr.game_day,
      season: tr.season,
      createdAt: tr.created_at,
      type: 'trade'
    }))

    for (const h of hiredEntries) {
      if (tradePlayerIds.has(h.player_id)) continue
      mapped.push({
        id: 'hired_' + h.player_id,
        playerId: h.player_id,
        playerName: h.player_name,
        playerPosition: h.player_position,
        fromTeamId: null,
        fromTeamName: null,
        fromTeam: null,
        toTeamId: teamId,
        toTeamName: null,
        toTeam: null,
        price: 0,
        gameDay: h.game_day,
        season: h.season,
        createdAt: h.created_at,
        type: 'hired'
      })
    }

    for (const f of firedEntries) {
      mapped.push({
        id: 'fired_' + f.player_id + '_' + f.created_at,
        playerId: f.player_id,
        playerName: f.player_name,
        playerPosition: f.player_position,
        fromTeamId: teamId,
        fromTeamName: null,
        fromTeam: null,
        toTeamId: null,
        toTeamName: null,
        toTeam: null,
        price: 0,
        gameDay: f.game_day,
        season: f.season,
        createdAt: f.created_at,
        type: 'fired'
      })
    }

    mapped.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    return { transfers: mapped }
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

    // Deduplicate seasons
    const uniqueSeasons = []
    const processedSeasons = new Set()
    for (const row of seasonData) {
      if (processedSeasons.has(row.season)) continue
      processedSeasons.add(row.season)
      uniqueSeasons.push(row)
    }

    if (uniqueSeasons.length === 0) {
      return { seasons: [] }
    }

    // Build WHERE clause for all season/level/league combos in one bulk query
    const sllConditions = uniqueSeasons.map(() => '(g.season = ? AND g.level = ? AND g.league = ?)').join(' OR ')
    const sllParams = uniqueSeasons.flatMap(r => [r.season, r.level, r.league])
    const seasonList = uniqueSeasons.map(r => r.season)
    const seasonPlaceholders = seasonList.map(() => '?').join(',')

    // Bulk-fetch all data in parallel (3 queries instead of 5*N).
    // Project only the columns we need — the `details` LONGTEXT column on `game`
    // is large and unused here, so excluding it makes the query an order of
    // magnitude faster on big tables.
    const [allLeagueGames, allCupGames, allMaxCupRounds] = await Promise.all([
      // All league games for all relevant season/level/league combos
      query(`
        SELECT g.season, g.level, g.league, g.team_1_id, g.team_2_id,
               g.goals_team_1, g.goals_team_2
        FROM game g
        WHERE (${sllConditions})
          AND g.played = 1
          AND (g.game_type = 'league' OR g.game_type IS NULL)
      `, sllParams),
      // All cup games for this team across all relevant seasons.
      // Split the OR on team_1_id / team_2_id into a UNION ALL so MySQL can
      // use the per-team indexes (idx_game_team1_played / idx_game_team2_played)
      // instead of falling back to a scan.
      query(`
        SELECT season, team_1_id, team_2_id, goals_team_1, goals_team_2, played, cup_round
        FROM game
        WHERE game_type = 'cup' AND season IN (${seasonPlaceholders}) AND team_1_id = ?
        UNION ALL
        SELECT season, team_1_id, team_2_id, goals_team_1, goals_team_2, played, cup_round
        FROM game
        WHERE game_type = 'cup' AND season IN (${seasonPlaceholders}) AND team_2_id = ?
        ORDER BY cup_round ASC
      `, [...seasonList, teamId, ...seasonList, teamId]),
      // Max cup_round per season for totalRounds calculation
      query(`
        SELECT season, MAX(cup_round) as maxRound
        FROM game
        WHERE game_type = 'cup' AND season IN (${seasonPlaceholders})
        GROUP BY season
      `, seasonList)
    ])

    // Index league games by season/level/league key
    const leagueGamesByKey = new Map()
    const teamIdsByKey = new Map()
    for (const game of allLeagueGames) {
      const key = `${game.season}/${game.level}/${game.league}`
      if (!leagueGamesByKey.has(key)) {
        leagueGamesByKey.set(key, [])
        teamIdsByKey.set(key, new Set())
      }
      leagueGamesByKey.get(key).push(game)
      teamIdsByKey.get(key).add(game.team_1_id)
      teamIdsByKey.get(key).add(game.team_2_id)
    }

    // Index cup games by season
    const cupGamesBySeason = new Map()
    for (const game of allCupGames) {
      if (!cupGamesBySeason.has(game.season)) {
        cupGamesBySeason.set(game.season, [])
      }
      cupGamesBySeason.get(game.season).push(game)
    }

    // Index max cup rounds by season
    const maxCupRoundBySeason = new Map()
    for (const row of allMaxCupRounds) {
      maxCupRoundBySeason.set(row.season, row.maxRound)
    }

    const seasons = []
    for (const row of uniqueSeasons) {
      const key = `${row.season}/${row.level}/${row.league}`
      const games = leagueGamesByKey.get(key) || []

      // Build minimal team objects from the game data (only id is needed for standing calc)
      const tIds = teamIdsByKey.get(key) || new Set()
      const teams = [...tIds].map(id => ({ id }))

      const standing = calculateStandingForTeam(games, teams, teamId)

      // Cup result
      let cupResult = null
      const cupGames = cupGamesBySeason.get(row.season) || []
      if (cupGames.length > 0) {
        const deepestCupGame = cupGames[0]
        const isWinner = deepestCupGame.played === 1 && (
          (deepestCupGame.team_1_id === teamId && deepestCupGame.goals_team_1 > deepestCupGame.goals_team_2) ||
          (deepestCupGame.team_2_id === teamId && deepestCupGame.goals_team_2 > deepestCupGame.goals_team_1)
        )
        const roundReached = deepestCupGame.cup_round
        const totalRounds = getTotalRounds(maxCupRoundBySeason.get(row.season))

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
