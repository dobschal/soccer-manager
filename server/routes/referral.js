import { query } from '../lib/database.js'
import { config } from '../config.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { isValidEmail, sendReferralEmail } from '../lib/email.js'
import { t } from '../i18n/index.js'
import { GIFTABLE_ACTION_CARD_TYPES } from './dev.js'
import { getReferralBenefit, setReferralBenefit } from '../helper/referralHelper.js'

const MAX_PENDING_INVITES_PER_USER = 50

export default {
  /**
   * Invite a friend by email. Sends a referral email and records the
   * invitation so the inviter receives the configured benefit when the
   * recipient registers with this address.
   * @param {string} email
   * @param {Request} req
   * @returns {Promise<{ success: boolean, sent: boolean }>}
   */
  async inviteFriendByEmail (email, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    if (typeof email !== 'string' || !isValidEmail(email.trim())) {
      throw new BadRequestError(t('error.emailInvalid', {}, locale))
    }
    const normalizedEmail = email.trim().toLowerCase()
    if (
      (req.user.email && req.user.email.toLowerCase() === normalizedEmail) ||
      (req.user.pending_email && req.user.pending_email.toLowerCase() === normalizedEmail)
    ) {
      throw new BadRequestError(t('error.referralSelfInvite', {}, locale))
    }
    const [existingUser] = await query(
      'SELECT id FROM user WHERE email=? OR pending_email=? LIMIT 1',
      [normalizedEmail, normalizedEmail]
    )
    if (existingUser) {
      throw new BadRequestError(t('error.referralAlreadyMember', {}, locale))
    }
    const [pendingCount] = await query(
      `SELECT COUNT(*) AS amount FROM referral_invitation
       WHERE inviter_user_id=? AND used_by_user_id IS NULL`,
      [req.user.id]
    )
    if (pendingCount.amount >= MAX_PENDING_INVITES_PER_USER) {
      throw new BadRequestError(t('error.referralLimitReached', {}, locale))
    }
    await query(
      'INSERT INTO referral_invitation (inviter_user_id, email) VALUES (?, ?)',
      [req.user.id, normalizedEmail]
    )
    const result = await sendReferralEmail({
      toEmail: normalizedEmail,
      locale,
      inviterUsername: req.user.username
    })
    return { success: true, sent: result.sent }
  },

  /**
   * Build the personal invite link for the current user. The inviter's username
   * is base64-encoded into the `i` query parameter; sharing this link lets a
   * new user be attributed to the inviter via their IP (see /invite landing).
   * @param {Request} req
   * @returns {Promise<{ url: string }>}
   */
  async getInviteLink (req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    const code = Buffer.from(req.user.username, 'utf8').toString('base64')
    return { url: `${config.PUBLIC_URL}/invite?i=${encodeURIComponent(code)}` }
  },

  /**
   * Get the current referral benefit setting (admin only).
   * @param {Request} req
   * @returns {Promise<{ action: string, options: string[] }>}
   */
  async getReferralSettings (req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const action = await getReferralBenefit()
    return { action, options: GIFTABLE_ACTION_CARD_TYPES }
  },

  /**
   * Set the referral benefit action card type (admin only).
   * @param {string} action
   * @param {Request} req
   * @returns {Promise<{ success: boolean, action: string }>}
   */
  async setReferralBenefit (action, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof action !== 'string' || !GIFTABLE_ACTION_CARD_TYPES.includes(action)) {
      throw new BadRequestError('Invalid action card type')
    }
    await setReferralBenefit(action)
    return { success: true, action }
  }
}
