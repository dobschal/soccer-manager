import { query } from '../lib/database.js'
import { UnauthorizedError } from '../lib/errors.js'
import { t } from '../i18n/index.js'

export default {

  /**
   * Search for players by name
   * @param {string} searchQuery
   * @param {Request} req
   * @returns {Promise<{players: PlayerType[], teams: TeamType[]}>}
   */
  async searchPlayers (searchQuery, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }

    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.length < 3) {
      return { players: [], teams: [] }
    }

    const searchPattern = `%${searchQuery}%`

    /** @type {PlayerType[]} */
    const players = await query(
      'SELECT p.* FROM player p JOIN team t ON t.id = p.team_id WHERE p.name LIKE ? AND t.is_system_team = 0 ORDER BY p.level DESC LIMIT 10',
      [searchPattern]
    )

    if (players.length === 0) {
      return { players: [], teams: [] }
    }

    const teamIds = [...new Set(players.map(p => p.team_id))]
    /** @type {TeamType[]} */
    const teams = await query(
      `SELECT * FROM team WHERE id IN (${teamIds.join(',')})`
    )

    return { players, teams }
  },

  /**
   * Search for teams by name
   * @param {string} searchQuery
   * @param {Request} req
   * @returns {Promise<{teams: TeamType[]}>}
   */
  async searchTeams (searchQuery, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }

    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.length < 3) {
      return { teams: [] }
    }

    const searchPattern = `%${searchQuery}%`

    /** @type {TeamType[]} */
    const teams = await query(
      'SELECT * FROM team WHERE name LIKE ? AND is_system_team = 0 ORDER BY level DESC LIMIT 10',
      [searchPattern]
    )

    return { teams }
  },

  /**
   * Search for users by username
   * @param {string} searchQuery
   * @param {Request} req
   * @returns {Promise<{users: Array<{id: number, username: string, team_id: number, team_name: string}>}>}
   */
  async searchUsers (searchQuery, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }

    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.length < 3) {
      return { users: [] }
    }

    const searchPattern = `%${searchQuery}%`

    const users = await query(
      'SELECT u.id, u.username, t.id AS team_id, t.name AS team_name FROM user u LEFT JOIN team t ON t.user_id = u.id WHERE u.username LIKE ? LIMIT 10',
      [searchPattern]
    )

    return { users }
  },

  /**
   * Browse all players with pagination
   * @param {string} searchQuery
   * @param {number} pageIndex
   * @param {number} pageSize
   * @param {string} sortColumn
   * @param {string} sortDirection
   * @param {Request} req
   * @returns {Promise<{players: Array, totalCount: number}>}
   */
  async browseAllPlayers (searchQuery, pageIndex, pageSize, sortColumn, sortDirection, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }

    pageIndex = Math.max(0, parseInt(pageIndex) || 0)
    pageSize = Math.min(50, Math.max(1, parseInt(pageSize) || 20))
    const offset = pageIndex * pageSize

    const allowedSortColumns = {
      name: 'p.name',
      position: 'p.position',
      level: 'p.level',
      age: 'p.carrier_start_season',
      team_name: 't.name',
      is_star_player: 'p.is_star_player'
    }
    const dir = sortDirection === 'ASC' ? 'ASC' : 'DESC'
    let orderBy = 'p.level DESC'
    if (sortColumn && allowedSortColumns[sortColumn]) {
      // Age sorting is reversed: higher carrier_start_season = younger
      const effectiveDir = sortColumn === 'age' ? (dir === 'ASC' ? 'DESC' : 'ASC') : dir
      orderBy = `${allowedSortColumns[sortColumn]} ${effectiveDir}`
    }

    let whereClause = 'WHERE p.team_id IS NOT NULL AND t.is_system_team = 0'
    const params = []

    if (searchQuery && typeof searchQuery === 'string' && searchQuery.length >= 3) {
      whereClause += ' AND p.name LIKE ?'
      params.push(`%${searchQuery}%`)
    }

    const [countResult] = await query(
      `SELECT COUNT(*) AS total FROM player p LEFT JOIN team t ON t.id = p.team_id ${whereClause}`,
      params
    )

    const players = await query(
      `SELECT p.*, t.name AS team_name FROM player p LEFT JOIN team t ON t.id = p.team_id ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    return { players, totalCount: countResult.total }
  },

  /**
   * Browse all teams with pagination
   * @param {string} searchQuery
   * @param {number} pageIndex
   * @param {number} pageSize
   * @param {string} sortColumn
   * @param {string} sortDirection
   * @param {Request} req
   * @returns {Promise<{teams: Array, totalCount: number}>}
   */
  async browseAllTeams (searchQuery, pageIndex, pageSize, sortColumn, sortDirection, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }

    pageIndex = Math.max(0, parseInt(pageIndex) || 0)
    pageSize = Math.min(50, Math.max(1, parseInt(pageSize) || 20))
    const offset = pageIndex * pageSize

    const allowedSortColumns = { name: 'name', level: 'level' }
    const dir = sortDirection === 'ASC' ? 'ASC' : 'DESC'
    let orderBy = 'level DESC'
    if (sortColumn && allowedSortColumns[sortColumn]) {
      orderBy = `${allowedSortColumns[sortColumn]} ${dir}`
    }

    let whereClause = 'WHERE is_system_team = 0'
    const params = []

    if (searchQuery && typeof searchQuery === 'string' && searchQuery.length >= 3) {
      whereClause += ' AND name LIKE ?'
      params.push(`%${searchQuery}%`)
    }

    const [countResult] = await query(
      `SELECT COUNT(*) AS total FROM team ${whereClause}`,
      params
    )

    const teams = await query(
      `SELECT * FROM team ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    return { teams, totalCount: countResult.total }
  },

  /**
   * Browse all users with pagination
   * @param {string} searchQuery
   * @param {number} pageIndex
   * @param {number} pageSize
   * @param {string} sortColumn
   * @param {string} sortDirection
   * @param {Request} req
   * @returns {Promise<{users: Array, totalCount: number}>}
   */
  async browseAllUsers (searchQuery, pageIndex, pageSize, sortColumn, sortDirection, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }

    pageIndex = Math.max(0, parseInt(pageIndex) || 0)
    pageSize = Math.min(50, Math.max(1, parseInt(pageSize) || 20))
    const offset = pageIndex * pageSize

    const allowedSortColumns = { username: 'u.username', team_name: 't.name' }
    const dir = sortDirection === 'ASC' ? 'ASC' : 'DESC'
    let orderBy = 'u.username ASC'
    if (sortColumn && allowedSortColumns[sortColumn]) {
      orderBy = `${allowedSortColumns[sortColumn]} ${dir}`
    }

    let whereClause = ''
    const params = []

    if (searchQuery && typeof searchQuery === 'string' && searchQuery.length >= 3) {
      whereClause = 'WHERE u.username LIKE ?'
      params.push(`%${searchQuery}%`)
    }

    const [countResult] = await query(
      `SELECT COUNT(*) AS total FROM user u ${whereClause}`,
      params
    )

    const users = await query(
      `SELECT u.id, u.username, t.id AS team_id, t.name AS team_name FROM user u LEFT JOIN team t ON t.user_id = u.id ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    return { users, totalCount: countResult.total }
  }
}
