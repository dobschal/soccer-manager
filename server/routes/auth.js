import { config } from '../config.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { query, transaction } from '../lib/database.js'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getSponsor } from '../helper/sponsorHelper.js'
import { prepareSeason, regenerateTeamData } from '../prepare-season.js'
import { getSupportedLocales, t } from '../i18n/index.js'
import { ActionCard } from '../entities/actionCard.js'
import { clearUserCache } from '../lib/userCache.js'
import { hashPassword, verifyPassword } from '../lib/passwordHash.js'
import { getGeoFromRequest } from '../lib/geoip.js'
import { clearBadge as clearPushBadge } from '../lib/pushNotification.js'

const AVATAR_UPLOAD_DIR = 'uploads/avatars'
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const AVATAR_MAX_INPUT_SIZE = 5 * 1024 * 1024 // 5MB raw upload limit
const AVATAR_SIZE_PX = 256

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
    let [team] = await query('SELECT * FROM team WHERE user_id IS NULL AND is_system_team = 0 ORDER BY level DESC LIMIT 1')
    if (!team) {
      // No team available - create new league(s) with prepareSeason and retry
      await prepareSeason();
      [team] = await query('SELECT * FROM team WHERE user_id IS NULL AND is_system_team = 0 ORDER BY level DESC LIMIT 1')
      if (!team) {
        throw new BadRequestError(t('error.noTeamAvailable', {}, locale))
      }
    }
    const { insertId: userId } = await query('INSERT INTO user SET ?', {
      username,
      password: await hashPassword(password),
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
    // Regenerate players/stadium/buildings if team was emptied (e.g. after account deletion)
    await regenerateTeamData(team)
    await query('DELETE FROM action_card WHERE team_id=?', [team.id])
    // Give new user 2 starter action cards
    const starterCards = [
      new ActionCard({ team_id: team.id, action: 'NEW_YOUTH_PLAYER', played: 0 }),
      new ActionCard({ team_id: team.id, action: 'LEVEL_UP_PLAYER_40', played: 0 })
    ]
    for (const card of starterCards) {
      await query('INSERT INTO action_card SET ?', card)
    }
    return { success: true }
  },

  /**
   * @param {string} username
   * @param {string} password
   * @param {string|Request} platformOrReq - platform string ('web'|'ios'|'android') or req if old client
   * @param {Request} [maybeReq]
   * @returns {Promise<{ token: string }>}
   */
  async login (username, password, platformOrReq, maybeReq) {
    let platform, req
    if (typeof platformOrReq === 'string') {
      platform = platformOrReq
      req = maybeReq
    } else {
      platform = 'web'
      req = platformOrReq
    }
    const locale = req.locale || 'en'
    if (typeof username !== 'string') {
      throw new BadRequestError(t('error.usernameString', {}, locale))
    }
    if (typeof password !== 'string') {
      throw new BadRequestError(t('error.passwordString', {}, locale))
    }
    const [user] = await query('SELECT * FROM user WHERE username=?', [username])
    if (!user || !(await verifyPassword(password, user.password))) {
      throw new UnauthorizedError(t('error.wrongCredentials', {}, locale))
    }
    const now = new Date()
    const platformColumn = platform === 'ios' ? 'last_login_ios'
      : platform === 'android' ? 'last_login_android'
        : 'last_login_web'
    const ipCol = `last_ip_${platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'web'}`
    const countryCol = `last_country_${platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'web'}`
    const regionCol = `last_region_${platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'web'}`
    const geo = getGeoFromRequest(req)
    await query(
      `UPDATE user SET last_login = ?, ${platformColumn} = ?, ${ipCol} = ?, ${countryCol} = ?, ${regionCol} = ? WHERE id = ?`,
      [now, now, geo.ip, geo.country, geo.region, user.id]
    )
    const token = jwt.sign({ sub: user.id }, config.SECRET)
    return { token }
  },

  /**
   * Register or update a device token for push notifications
   * @param {string} token - device token
   * @param {string} platform - 'ios' or 'android'
   * @param {Request} req
   * @returns {Promise<{ success: boolean }>}
   */
  async registerDeviceToken (token, platform, req) {
    const locale = req.locale || 'en'
    console.log(`[Push] registerDeviceToken called - user: ${req.user?.id ?? 'none'}, platform: ${platform}, token: ${token ? token.substring(0, 10) + '...' : 'EMPTY/NULL'} (length: ${token?.length ?? 0})`)
    if (!req.user) {
      console.log('[Push] registerDeviceToken REJECTED: no user on request')
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    if (typeof token !== 'string' || !token) {
      console.log(`[Push] registerDeviceToken REJECTED: invalid token (type: ${typeof token}, value: ${JSON.stringify(token)})`)
      throw new BadRequestError('Invalid device token')
    }
    if (!['ios', 'android'].includes(platform)) {
      console.log(`[Push] registerDeviceToken REJECTED: invalid platform "${platform}"`)
      throw new BadRequestError('Invalid platform, must be ios or android')
    }
    await query(
      'INSERT INTO device_token (user_id, token, platform) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE token = ?, updated_at = NOW()',
      [req.user.id, token, platform, token]
    )
    console.log(`[Push] registerDeviceToken SUCCESS - user: ${req.user.id}, platform: ${platform}`)
    return { success: true }
  },

  /**
   * Clear the iOS badge count by sending a silent push with badge = 0
   * @param {Request} req
   * @returns {Promise<{ success: boolean }>}
   */
  async clearBadge (req) {
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, req.locale || 'en'))
    }
    await clearPushBadge(req.user.id)
    return { success: true }
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
  },

  /**
   * Upload a profile picture for the current user. The image is cropped
   * to a centered square and resized to AVATAR_SIZE_PX before being
   * persisted under uploads/avatars/.
   * @param {string} data - base64 data URL (e.g. "data:image/png;base64,…")
   * @param {string} type - MIME type, e.g. "image/png"
   * @param {Request} req
   * @returns {Promise<{ avatar: string }>}
   */
  async uploadAvatar (data, type, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    if (!data || typeof data !== 'string') {
      throw new BadRequestError('Invalid image data')
    }
    if (!AVATAR_ALLOWED_TYPES.includes(type)) {
      throw new BadRequestError('Invalid image type')
    }
    const base64Data = data.replace(/^data:[^;]+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    if (buffer.length === 0 || buffer.length > AVATAR_MAX_INPUT_SIZE) {
      throw new BadRequestError('Image too large')
    }

    fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true })
    const filename = `${crypto.randomUUID()}.jpg`
    const filePath = path.join(AVATAR_UPLOAD_DIR, filename)

    const meta = await sharp(buffer).metadata()
    const size = Math.min(meta.width || AVATAR_SIZE_PX, meta.height || AVATAR_SIZE_PX)
    const left = Math.floor(((meta.width || size) - size) / 2)
    const top = Math.floor(((meta.height || size) - size) / 2)
    await sharp(buffer)
      .extract({ left, top, width: size, height: size })
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX)
      .jpeg({ quality: 88 })
      .toFile(filePath)

    const [existing] = await query('SELECT avatar FROM user WHERE id=?', [req.user.id])
    await query('UPDATE user SET avatar=? WHERE id=?', [filename, req.user.id])
    clearUserCache(req.user.id)

    if (existing?.avatar) {
      const oldPath = path.join(AVATAR_UPLOAD_DIR, existing.avatar)
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath) } catch (e) { console.warn('Could not remove old avatar:', e.message) }
      }
    }

    return { avatar: filename }
  },

  /**
   * Remove the current user's profile picture.
   * @param {Request} req
   * @returns {Promise<{ success: boolean }>}
   */
  async removeAvatar (req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    const [existing] = await query('SELECT avatar FROM user WHERE id=?', [req.user.id])
    if (existing?.avatar) {
      const oldPath = path.join(AVATAR_UPLOAD_DIR, existing.avatar)
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath) } catch (e) { console.warn('Could not remove avatar:', e.message) }
      }
    }
    await query('UPDATE user SET avatar=NULL WHERE id=?', [req.user.id])
    clearUserCache(req.user.id)
    return { success: true }
  },

  /**
   * Delete the current user's account and disassociate from their team.
   * The team is kept as a bot (user_id = NULL) for league integrity.
   * @param {Request} req
   * @returns {Promise<{ success: boolean }>}
   */
  async deleteAccount (req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    const userId = req.user.id
    const [team] = await query('SELECT * FROM team WHERE user_id=?', [userId])

    await transaction(async (txQuery) => {
      if (team) {
        // Delete news interactions
        await txQuery('DELETE FROM news_comment WHERE user_id=?', [userId])
        await txQuery('DELETE FROM news_like WHERE user_id=?', [userId])

        // Delete player-related data
        await txQuery('DELETE FROM player_history WHERE player_id IN (SELECT id FROM player WHERE team_id=?)', [team.id])
        await txQuery('DELETE FROM player_season_stats WHERE player_id IN (SELECT id FROM player WHERE team_id=?)', [team.id])

        // Delete trade data
        await txQuery('DELETE FROM trade_history WHERE from_team_id=? OR to_team_id=?', [team.id, team.id])
        await txQuery('DELETE FROM trade_offer WHERE from_team_id=? OR player_id IN (SELECT id FROM player WHERE team_id=?)', [team.id, team.id])

        // Delete team entities
        await txQuery('DELETE FROM player WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM youth_player WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM action_card WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM finance_log WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM log_message WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM building WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM sponsor WHERE team_id=?', [team.id])

        // Delete stadium data
        const [stadium] = await txQuery('SELECT id FROM stadium WHERE team_id=?', [team.id])
        if (stadium) {
          await txQuery('DELETE FROM stadium_construction_history WHERE stadium_id=?', [stadium.id])
        }
        await txQuery('DELETE FROM stadium WHERE team_id=?', [team.id])

        // Keep team as bot for league integrity
        await txQuery('UPDATE team SET user_id=NULL, description=NULL WHERE id=?', [team.id])
      }

      // Delete device tokens
      await txQuery('DELETE FROM device_token WHERE user_id=?', [userId])

      // Delete user
      await txQuery('DELETE FROM user WHERE id=?', [userId])
    })

    clearUserCache(userId)
    return { success: true }
  }

}
