import { config } from '../config.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { query, transaction } from '../lib/database.js'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import { getSupportedLocales, t } from '../i18n/index.js'
import { clearUserCache } from '../lib/userCache.js'
import { hashPassword, verifyPassword } from '../lib/passwordHash.js'
import { getGeoFromRequest } from '../lib/geoip.js'
import { clearBadge as clearPushBadge } from '../lib/pushNotification.js'
import { isValidEmail, sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js'
import { claimReferralForNewUser, awardReferralForVerifiedUser } from '../helper/referralHelper.js'

const EMAIL_VERIFICATION_TTL_DAYS = 7
const PASSWORD_RESET_TTL_HOURS = 2

/**
 * Look up other users that already claim this email either as their verified
 * address or as a pending change. Excludes the current user when provided.
 * @param {string} email
 * @param {number|null} excludeUserId
 * @returns {Promise<boolean>}
 */
async function emailIsTakenByAnotherUser (email, excludeUserId = null) {
  const params = [email, email]
  let sql = 'SELECT id FROM user WHERE (email=? OR pending_email=?)'
  if (excludeUserId) {
    sql += ' AND id<>?'
    params.push(excludeUserId)
  }
  sql += ' LIMIT 1'
  const [row] = await query(sql, params)
  return !!row
}

const AVATAR_UPLOAD_DIR = 'uploads/avatars'
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const AVATAR_MAX_INPUT_SIZE = 5 * 1024 * 1024 // 5MB raw upload limit
const AVATAR_SIZE_PX = 256

export default {

  /**
   * @param {string} username
   * @param {string} password
   * @param {string|null} email - optional, when provided is stored as pending and verification email is sent
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async createAccount (username, password, email, req) {
    // Backwards-compat: pre-email clients send (username, password, req) so the
    // third positional arg is the Request object.
    if (req === undefined && email !== null && typeof email === 'object') {
      req = email
      email = null
    }
    const locale = req.locale || 'en'
    if (typeof username !== 'string') {
      throw new BadRequestError(t('error.usernameString', {}, locale))
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new BadRequestError(t('error.passwordLength', {}, locale))
    }
    let normalizedEmail = null
    if (email !== undefined && email !== null && email !== '') {
      if (typeof email !== 'string' || !isValidEmail(email.trim())) {
        throw new BadRequestError(t('error.emailInvalid', {}, locale))
      }
      normalizedEmail = email.trim().toLowerCase()
      if (await emailIsTakenByAnotherUser(normalizedEmail)) {
        throw new BadRequestError(t('error.emailTaken', {}, locale))
      }
    }
    const [{ amount }] = await query('SELECT COUNT(*) AS amount FROM user WHERE username=?', username)
    if (amount > 0) {
      throw new BadRequestError(t('error.usernameTaken', {}, locale))
    }
    let verificationToken = null
    let verificationExpires = null
    if (normalizedEmail) {
      verificationToken = crypto.randomBytes(32).toString('hex')
      verificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000)
    }
    const insertResult = await query('INSERT INTO user SET ?', {
      username,
      password: await hashPassword(password),
      language: locale,
      pending_email: normalizedEmail,
      email_verification_token: verificationToken,
      email_verification_expires_at: verificationExpires
    })
    if (normalizedEmail && verificationToken) {
      sendVerificationEmail({ toEmail: normalizedEmail, token: verificationToken, locale, username })
        .catch(e => console.error('[Auth] sendVerificationEmail failed:', e))
    }
    if (normalizedEmail && insertResult?.insertId) {
      try {
        await claimReferralForNewUser({ email: normalizedEmail, newUserId: insertResult.insertId })
      } catch (e) {
        console.error('[Auth] claimReferralForNewUser failed:', e)
      }
    }
    return { success: true }
  },

  /**
   * Add or change the user's email. The new address is stored as a pending
   * change until the user clicks the verification link sent by email.
   * @param {string} email
   * @param {Request} req
   * @returns {Promise<{ pendingEmail: string }>}
   */
  async setEmail (email, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    if (typeof email !== 'string' || !isValidEmail(email.trim())) {
      throw new BadRequestError(t('error.emailInvalid', {}, locale))
    }
    const normalizedEmail = email.trim().toLowerCase()
    // No-op if it matches the user's already-verified address.
    if (req.user.email && req.user.email.toLowerCase() === normalizedEmail) {
      await query(
        'UPDATE user SET pending_email=NULL, email_verification_token=NULL, email_verification_expires_at=NULL WHERE id=?',
        [req.user.id]
      )
      clearUserCache(req.user.id)
      return { pendingEmail: null }
    }
    if (await emailIsTakenByAnotherUser(normalizedEmail, req.user.id)) {
      throw new BadRequestError(t('error.emailTaken', {}, locale))
    }
    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000)
    await query(
      'UPDATE user SET pending_email=?, email_verification_token=?, email_verification_expires_at=? WHERE id=?',
      [normalizedEmail, token, expires, req.user.id]
    )
    clearUserCache(req.user.id)
    sendVerificationEmail({ toEmail: normalizedEmail, token, locale, username: req.user.username })
      .catch(e => console.error('[Auth] sendVerificationEmail failed:', e))
    return { pendingEmail: normalizedEmail }
  },

  /**
   * Verify an email change using the token sent by email.
   * Public — does not require auth so a user can click the link on any device.
   * @param {string} token
   * @param {Request} req
   * @returns {Promise<{ success: boolean, email: string }>}
   */
  async verifyEmail (token, req) {
    const locale = req.locale || 'en'
    if (typeof token !== 'string' || token.length < 16) {
      throw new BadRequestError(t('error.verificationTokenInvalid', {}, locale))
    }
    const [user] = await query(
      'SELECT id, username, pending_email, email_verification_expires_at FROM user WHERE email_verification_token=? LIMIT 1',
      [token]
    )
    if (!user || !user.pending_email) {
      throw new BadRequestError(t('error.verificationTokenInvalid', {}, locale))
    }
    if (user.email_verification_expires_at && new Date(user.email_verification_expires_at).getTime() < Date.now()) {
      throw new BadRequestError(t('error.verificationTokenInvalid', {}, locale))
    }
    // Final uniqueness check in case someone else verified the same address in the meantime
    const [conflict] = await query(
      'SELECT id FROM user WHERE email=? AND id<>? LIMIT 1',
      [user.pending_email, user.id]
    )
    if (conflict) {
      throw new BadRequestError(t('error.emailTaken', {}, locale))
    }
    await query(
      'UPDATE user SET email=?, pending_email=NULL, email_verification_token=NULL, email_verification_expires_at=NULL WHERE id=?',
      [user.pending_email, user.id]
    )
    clearUserCache(user.id)
    try {
      await awardReferralForVerifiedUser({ userId: user.id })
    } catch (e) {
      console.error('[Auth] awardReferralForVerifiedUser failed:', e)
    }
    return { success: true, email: user.pending_email }
  },

  /**
   * Request a password reset link. Always returns success to avoid leaking
   * whether an email is registered. If a verified user with this email exists,
   * a reset token is generated and an email is sent.
   * @param {string} email
   * @param {Request} req
   * @returns {Promise<{ success: boolean }>}
   */
  async requestPasswordReset (email, req) {
    const locale = req.locale || 'en'
    if (typeof email !== 'string' || !isValidEmail(email.trim())) {
      throw new BadRequestError(t('error.emailInvalid', {}, locale))
    }
    const normalizedEmail = email.trim().toLowerCase()
    const [user] = await query(
      'SELECT id, username, email, language FROM user WHERE email=? LIMIT 1',
      [normalizedEmail]
    )
    if (!user) {
      return { success: true }
    }
    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000)
    await query(
      'UPDATE user SET password_reset_token=?, password_reset_expires_at=? WHERE id=?',
      [token, expires, user.id]
    )
    const emailLocale = user.language || locale
    sendPasswordResetEmail({ toEmail: user.email, token, locale: emailLocale, username: user.username })
      .catch(e => console.error('[Auth] sendPasswordResetEmail failed:', e))
    return { success: true }
  },

  /**
   * Complete a password reset using the token sent by email.
   * Public — does not require auth so a user can click the link on any device.
   * @param {string} token
   * @param {string} newPassword
   * @param {Request} req
   * @returns {Promise<{ success: boolean }>}
   */
  async resetPassword (token, newPassword, req) {
    const locale = req.locale || 'en'
    if (typeof token !== 'string' || token.length < 16) {
      throw new BadRequestError(t('error.passwordResetTokenInvalid', {}, locale))
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new BadRequestError(t('error.passwordLength', {}, locale))
    }
    const [user] = await query(
      'SELECT id, password_reset_expires_at FROM user WHERE password_reset_token=? LIMIT 1',
      [token]
    )
    if (!user) {
      throw new BadRequestError(t('error.passwordResetTokenInvalid', {}, locale))
    }
    if (user.password_reset_expires_at && new Date(user.password_reset_expires_at).getTime() < Date.now()) {
      throw new BadRequestError(t('error.passwordResetTokenInvalid', {}, locale))
    }
    const hashed = await hashPassword(newPassword)
    await query(
      'UPDATE user SET password=?, password_reset_token=NULL, password_reset_expires_at=NULL WHERE id=?',
      [hashed, user.id]
    )
    clearUserCache(user.id)
    return { success: true }
  },

  /**
   * @param {string} username
   * @param {string} password
   * @param {string|Request} platformOrReq - platform string ('web'|'ios'|'android') or req if old client
   * @param {string|Request} [deviceUuidOrReq] - device UUID from localStorage, or req if old client
   * @param {Request} [maybeReq]
   * @returns {Promise<{ token: string }>}
   */
  async login (username, password, platformOrReq, deviceUuidOrReq, maybeReq) {
    let platform, deviceUuid, req
    if (typeof platformOrReq === 'string') {
      platform = platformOrReq
      // Newer clients send (username, password, platform, deviceUuid, req).
      // Older "platform-aware" clients only send (username, password, platform, req).
      if (typeof deviceUuidOrReq === 'string') {
        deviceUuid = deviceUuidOrReq
        req = maybeReq
      } else {
        deviceUuid = null
        req = deviceUuidOrReq
      }
    } else {
      platform = 'web'
      deviceUuid = null
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
    if (typeof deviceUuid === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(deviceUuid)) {
      await query(
        `INSERT INTO user_device (user_id, device_uuid, first_seen, last_seen)
         VALUES (?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE last_seen = NOW()`,
        [user.id, deviceUuid]
      )
    }
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
   * Change the current user's password. Requires the old password for
   * verification before storing the new password hash.
   * @param {string} oldPassword
   * @param {string} newPassword
   * @param {Request} req
   * @returns {Promise<{ success: boolean }>}
   */
  async setPassword (oldPassword, newPassword, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    if (typeof oldPassword !== 'string' || typeof newPassword !== 'string') {
      throw new BadRequestError(t('error.passwordString', {}, locale))
    }
    if (newPassword.length < 8) {
      throw new BadRequestError(t('error.passwordLength', {}, locale))
    }
    const [user] = await query('SELECT password FROM user WHERE id=?', [req.user.id])
    if (!user || !(await verifyPassword(oldPassword, user.password))) {
      throw new UnauthorizedError(t('error.wrongOldPassword', {}, locale))
    }
    await query('UPDATE user SET password=? WHERE id=?', [await hashPassword(newPassword), req.user.id])
    clearUserCache(req.user.id)
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
        await txQuery('UPDATE team SET user_id=NULL, description=NULL, coach_since=NULL WHERE id=?', [team.id])
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
