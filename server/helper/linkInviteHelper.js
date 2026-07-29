import { query } from '../lib/database.js'
import { getReferralBenefit } from './referralHelper.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { canReceiveActionCard } from './actionCardHelper.js'

// How long a recorded link click stays valid for matching against a later
// registration from the same IP. Keeps stale invites from latching onto an
// unrelated user that happens to share the IP weeks later.
const LINK_INVITE_TTL_HOURS = 72

/**
 * Record that a visitor coming from an invite link (identified only by their
 * IP address at click time) was invited by `inviterUserId`. Older pending
 * clicks for the same IP are dropped so the most recent invite wins.
 * @param {object} args
 * @param {number} args.inviterUserId
 * @param {string} args.ip
 * @returns {Promise<{ recorded: boolean }>}
 */
export async function recordLinkInvite ({ inviterUserId, ip }) {
  if (!inviterUserId || !ip || ip === 'unknown') return { recorded: false }
  // Drop any earlier unclaimed click from this IP — only the latest invite
  // should be honoured when the visitor eventually registers.
  await query(
    'DELETE FROM link_invite WHERE invitee_ip=? AND used_by_user_id IS NULL',
    [ip]
  )
  await query(
    'INSERT INTO link_invite (inviter_user_id, invitee_ip) VALUES (?, ?)',
    [inviterUserId, ip]
  )
  return { recorded: true }
}

/**
 * Link a recent invite-link click to the freshly signed-up user by matching
 * the registration IP. Establishes a mutual friendship immediately but defers
 * the inviter's reward until the new user verifies their email
 * (see {@link awardLinkInviteForVerifiedUser}). No-op when nothing matches.
 * @param {object} args
 * @param {string} args.ip - the new user's registration IP
 * @param {number} args.newUserId
 * @returns {Promise<{ linked: boolean, inviterUserId?: number, action?: string }>}
 */
export async function claimLinkInviteForNewUser ({ ip, newUserId }) {
  if (!ip || ip === 'unknown' || !newUserId) return { linked: false }
  const [invite] = await query(
    `SELECT id, inviter_user_id FROM link_invite
     WHERE invitee_ip=? AND used_by_user_id IS NULL
       AND created_at >= (NOW() - INTERVAL ? HOUR)
       AND inviter_user_id <> ?
     ORDER BY created_at DESC LIMIT 1`,
    [ip, LINK_INVITE_TTL_HOURS, newUserId]
  )
  if (!invite) return { linked: false }
  const action = await getReferralBenefit()
  await query(
    'UPDATE link_invite SET used_by_user_id=?, used_at=NOW(), reward_action=? WHERE id=?',
    [newUserId, action, invite.id]
  )
  // Auto-establish a mutual friendship so inviter and invitee can immediately
  // find each other, mirroring the email referral flow. INSERT IGNORE keeps it
  // safe if either direction already exists.
  await query(
    'INSERT IGNORE INTO user_friend (user_id, friend_user_id) VALUES (?, ?), (?, ?)',
    [invite.inviter_user_id, newUserId, newUserId, invite.inviter_user_id]
  )
  return { linked: true, inviterUserId: invite.inviter_user_id, action }
}

/**
 * Award the configured benefit to the inviter once the link-invited user has
 * verified their email. Mirrors {@link awardReferralForVerifiedUser} but keys
 * off the link_invite table. The action card is inserted as `pending`.
 * @param {object} args
 * @param {number} args.userId - the verified user's id
 * @returns {Promise<{ awarded: boolean, inviterUserId?: number, action?: string }>}
 */
export async function awardLinkInviteForVerifiedUser ({ userId }) {
  if (!userId) return { awarded: false }
  const [invite] = await query(
    `SELECT id, inviter_user_id, reward_action FROM link_invite
     WHERE used_by_user_id=? AND rewarded_at IS NULL
     ORDER BY used_at ASC LIMIT 1`,
    [userId]
  )
  if (!invite) return { awarded: false }
  const action = invite.reward_action || await getReferralBenefit()
  const [team] = await query(
    'SELECT id FROM team WHERE user_id=? LIMIT 1',
    [invite.inviter_user_id]
  )
  if (team && await canReceiveActionCard(team.id, action)) {
    const { season } = await getGameDayAndSeason()
    await query(
      'INSERT INTO action_card (team_id, action, played, state, season) VALUES (?, ?, 0, ?, ?)',
      [team.id, action, 'pending', season]
    )
  }
  await query(
    'UPDATE link_invite SET rewarded_at=NOW() WHERE id=?',
    [invite.id]
  )
  return { awarded: Boolean(team), inviterUserId: invite.inviter_user_id, action }
}
