import { config } from '../config.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { query } from '../lib/database.js'
import jwt from 'jsonwebtoken'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getSponsor } from '../helper/sponsorHelper.js'
import { prepareSeason } from '../prepare-season.js'
import { getSupportedLocales, t } from '../i18n/index.js'
import { ActionCard } from '../entities/actionCard.js'
import { clearUserCache } from '../lib/userCache.js'

export default {

  /**
   * @param {string} username
   * @param {string} password
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async createAccount (username, password, req) {
    const locale = req.locale || 'en'
    if (typeof username !== 'string') {
      throw new BadRequestError(t('error.usernameString', {}, locale))
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new BadRequestError(t('error.passwordLength', {}, locale))
    }
    const [{ amount }] = await query('SELECT COUNT(*) AS amount FROM user WHERE username=?', username)
    if (amount > 0) {
      throw new BadRequestError(t('error.usernameTaken', {}, locale))
    }
    let [team] = await query('SELECT * FROM team WHERE user_id IS NULL ORDER BY level DESC LIMIT 1')
    if (!team) {
      // No team available - create new league(s) with prepareSeason and retry
      await prepareSeason();
      [team] = await query('SELECT * FROM team WHERE user_id IS NULL ORDER BY level DESC LIMIT 1')
      if (!team) {
        throw new BadRequestError(t('error.noTeamAvailable', {}, locale))
      }
    }
    const { insertId: userId } = await query('INSERT INTO user SET ?', {
      username,
      password,
      language: locale
    })
    // Clean up old bot data before assigning team to user
    await query('DELETE FROM log_message WHERE team_id=?', [team.id])
    await query('DELETE FROM trade_offer WHERE from_team_id=?', [team.id])
    await query('DELETE FROM trade_offer WHERE player_id IN (SELECT id FROM player WHERE team_id=?)', [team.id])
    await addLogMessage(t('log.welcome', {
      username,
      teamName: team.name
    }, locale), team, null, null, 'hand-peace-o')
    await query(`UPDATE team
                 SET user_id=${userId},
                     balance=500000
                 WHERE id = ${team.id}`)
    const { sponsor } = await getSponsor(team)
    if (sponsor) {
      await query('DELETE FROM sponsor WHERE id=?', [sponsor.id])
    }
    await query('DELETE FROM action_card WHERE team_id=?', [team.id])
    // Give new user 3 starter action cards
    const starterCards = [
      new ActionCard({ team_id: team.id, action: 'LEVEL_UP_PLAYER_4', played: 0 }),
      new ActionCard({ team_id: team.id, action: 'FRESHNESS_10', played: 0 }),
      new ActionCard({ team_id: team.id, action: 'CHANGE_PLAYER_POSITION', played: 0 })
    ]
    for (const card of starterCards) {
      await query('INSERT INTO action_card SET ?', card)
    }
    return { success: true }
  },

  /**
   * @param {string} username
   * @param {string} password
   * @param {Request} req
   * @returns {Promise<{ token: string }>}
   */
  async login (username, password, req) {
    const locale = req.locale || 'en'
    if (typeof username !== 'string') {
      throw new BadRequestError(t('error.usernameString', {}, locale))
    }
    if (typeof password !== 'string') {
      throw new BadRequestError(t('error.passwordString', {}, locale))
    }
    const [user] = await query('SELECT * FROM user WHERE username=?', [username])
    if (!user || user.password !== password) {
      throw new UnauthorizedError(t('error.wrongCredentials', {}, locale))
    }
    const token = jwt.sign({ sub: user.id }, config.SECRET)
    return { token }
  },

  /**
   * Set the user's preferred language
   * @param {string} language
   * @param {Request} req
   * @returns {Promise<{ success: boolean }>}
   */
  async setLanguage (language, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    const supportedLocales = getSupportedLocales()
    if (!supportedLocales.includes(language)) {
      throw new BadRequestError(t('error.invalidLanguage', {}, locale))
    }
    await query('UPDATE user SET language=? WHERE id=?', [language, req.user.id])
    clearUserCache(req.user.id)
    return { success: true }
  }

}
