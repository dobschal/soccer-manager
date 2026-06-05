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
 * Link a pending invitation to the freshly signed-up user, but do NOT award
 * the bonus yet — the inviter's action card is granted only after the new
 * user verifies their email (see {@link awardReferralForVerifiedUser}).
 * No-op when there is no pending invitation for `email`.
 * @param {object} args
 * @param {string} args.email - the new user's normalized pending email
 * @param {number} args.newUserId - the freshly inserted user id
 * @returns {Promise<{ linked: boolean, inviterUserId?: number, action?: string }>}
 */
export async function claimReferralForNewUser ({ email, newUserId }) {
  if (!email || !newUserId) return { linked: false }
  const [invitation] = await query(
    `SELECT id, inviter_user_id FROM referral_invitation
     WHERE email=? AND used_by_user_id IS NULL
     ORDER BY created_at ASC LIMIT 1`,
    [email]
  )
  if (!invitation) return { linked: false }
  const action = await getReferralBenefit()
  await query(
    'UPDATE referral_invitation SET used_by_user_id=?, used_at=NOW(), reward_action=? WHERE id=?',
    [newUserId, action, invitation.id]
  )
  // Auto-establish a mutual friendship between inviter and invitee so they
  // can immediately see each other's matches and find each other on the
  // Friends page. Either direction may already exist if the user manually
  // added the other earlier, so INSERT IGNORE is safe.
  if (invitation.inviter_user_id && invitation.inviter_user_id !== newUserId) {
    await query(
      'INSERT IGNORE INTO user_friend (user_id, friend_user_id) VALUES (?, ?), (?, ?)',
      [invitation.inviter_user_id, newUserId, newUserId, invitation.inviter_user_id]
    )
  }
  return { linked: true, inviterUserId: invitation.inviter_user_id, action }
}

/**
 * Award the configured referral benefit to the inviter once the invited user
 * has verified their email. Looks up invitations that were linked at signup
 * but not yet rewarded. The action card is inserted as `pending` so the
 * inviter sees the claim overlay on their next dashboard visit.
 * @param {object} args
 * @param {number} args.userId - the verified user's id
 * @returns {Promise<{ awarded: boolean, inviterUserId?: number, action?: string }>}
 */
export async function awardReferralForVerifiedUser ({ userId }) {
  if (!userId) return { awarded: false }
  const [invitation] = await query(
    `SELECT id, inviter_user_id, reward_action FROM referral_invitation
     WHERE used_by_user_id=? AND rewarded_at IS NULL
     ORDER BY used_at ASC LIMIT 1`,
    [userId]
  )
  if (!invitation) return { awarded: false }
  const action = invitation.reward_action || await getReferralBenefit()
  const [team] = await query(
    'SELECT id FROM team WHERE user_id=? LIMIT 1',
    [invitation.inviter_user_id]
  )
  if (team) {
    const { season } = await getGameDayAndSeason()
    await query(
      'INSERT INTO action_card (team_id, action, played, state, season) VALUES (?, ?, 0, ?, ?)',
      [team.id, action, 'pending', season]
    )
  }
  await query(
    'UPDATE referral_invitation SET rewarded_at=NOW() WHERE id=?',
    [invitation.id]
  )
  return { awarded: Boolean(team), inviterUserId: invitation.inviter_user_id, action }
}
