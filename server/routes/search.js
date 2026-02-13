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
      'SELECT * FROM player WHERE name LIKE ? AND team_id IS NOT NULL ORDER BY level DESC LIMIT 10',
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
      'SELECT * FROM team WHERE name LIKE ? ORDER BY level DESC LIMIT 10',
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
  }
}
