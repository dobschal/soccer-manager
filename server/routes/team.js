import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { getAveragePlanPriceOfPlayer } from '../helper/playerHelper.js'
import { cityNames, clubPrefixes1, clubPrefixes2 } from '../lib/name-library.js'
import { clearCacheByPrefix, CACHE_NAMESPACES } from '../lib/cache.js'

export default {

  /**
   * @param {Request} req
   * @returns {Promise<{user: Object, team: TeamType, players: Array<PlayerType>}>}
   */
  async getMyTeam (req) {
    const team = await getTeam(req)
    const players = await query('SELECT * FROM player WHERE team_id=?', team.id)
    delete req.user.password
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
  }
}
