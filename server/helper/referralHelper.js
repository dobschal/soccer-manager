import { query } from '../lib/database.js'
import { getGameDayAndSeason } from './gameDayHelper.js'

const DEFAULT_REFERRAL_BENEFIT = 'BONUS_100K'

/**
 * Read the current admin-configured referral benefit (an action card type).
 * Falls back to a sensible default if the setting was never written.
 * @returns {Promise<string>}
 */
export async function getReferralBenefit () {
  const [row] = await query(
    "SELECT setting_value FROM app_setting WHERE setting_key='referral_benefit' LIMIT 1"
  )
  return row?.setting_value || DEFAULT_REFERRAL_BENEFIT
}

/**
 * Persist the referral benefit setting (admin only — caller must auth-check).
 * @param {string} action - one of GIFTABLE_ACTION_CARD_TYPES
 * @returns {Promise<void>}
 */
export async function setReferralBenefit (action) {
  await query(
    `INSERT INTO app_setting (setting_key, setting_value) VALUES ('referral_benefit', ?)
     ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)`,
    [action]
  )
}

/**
 * Award the configured referral benefit to the inviter's team and mark the
 * invitation as used. No-op when there is no pending invitation for `email`
 * or when the inviter has no team. The action card is inserted as `pending`
 * so the inviter sees the claim overlay on their next dashboard visit.
 * @param {object} args
 * @param {string} args.email - the new user's normalized email address
 * @param {number} args.newUserId - the freshly inserted user id
 * @returns {Promise<{ awarded: boolean, inviterUserId?: number, action?: string }>}
 */
export async function claimReferralForNewUser ({ email, newUserId }) {
  if (!email || !newUserId) return { awarded: false }
  const [invitation] = await query(
    `SELECT id, inviter_user_id FROM referral_invitation
     WHERE email=? AND used_by_user_id IS NULL
     ORDER BY created_at ASC LIMIT 1`,
    [email]
  )
  if (!invitation) return { awarded: false }
  const [team] = await query(
    'SELECT id FROM team WHERE user_id=? LIMIT 1',
    [invitation.inviter_user_id]
  )
  const action = await getReferralBenefit()
  if (team) {
    const { season } = await getGameDayAndSeason()
    await query(
      'INSERT INTO action_card (team_id, action, played, state, season) VALUES (?, ?, 0, ?, ?)',
      [team.id, action, 'pending', season]
    )
  }
  await query(
    'UPDATE referral_invitation SET used_by_user_id=?, used_at=NOW(), reward_action=? WHERE id=?',
    [newUserId, action, invitation.id]
  )
  return { awarded: Boolean(team), inviterUserId: invitation.inviter_user_id, action }
}
