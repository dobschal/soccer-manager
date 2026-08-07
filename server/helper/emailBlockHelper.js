import { query } from '../lib/database.js'
import { clearUserCache } from '../lib/userCache.js'

/**
 * Bring an address into the form used by the `blocked_email` table and by
 * `user.email` / `user.pending_email`: trimmed and lower-cased.
 * @param {string} email
 * @returns {string}
 */
export function normalizeEmail (email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/**
 * Whether this address is on the block list. Empty/missing addresses are never
 * blocked — accounts without an email are legal in this game.
 * @param {string|null} email
 * @returns {Promise<boolean>}
 */
export async function isEmailBlocked (email) {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  const [row] = await query('SELECT id FROM blocked_email WHERE email=? LIMIT 1', [normalized])
  return !!row
}

/**
 * Whether any of the addresses attached to a user row is blocked. Checks the
 * verified address as well as a pending (unverified) change, so switching to a
 * fresh address cannot be used to sit out a block.
 * @param {{email?: string|null, pending_email?: string|null}} user
 * @returns {Promise<boolean>}
 */
export async function userHasBlockedEmail (user) {
  if (!user) return false
  const candidates = [user.email, user.pending_email].map(normalizeEmail).filter(Boolean)
  if (candidates.length === 0) return false
  const [row] = await query(
    `SELECT id FROM blocked_email WHERE email IN (${candidates.map(() => '?').join(',')}) LIMIT 1`,
    candidates
  )
  return !!row
}

/**
 * Reject every JWT issued to this user before now. Tokens carry an `iat`
 * claim, so bumping `sessions_invalid_before` is enough to make the auth
 * middleware drop the existing sessions on the next request — there is no
 * server-side session store to clear.
 *
 * `iat` has second precision and rounds down, so a token minted in the same
 * second as the block would survive the comparison. Rounding the cut-off up to
 * the next full second closes that window.
 * @param {number} userId
 * @returns {Promise<void>}
 */
export async function invalidateUserSessions (userId) {
  if (!userId) return
  await query(
    'UPDATE user SET sessions_invalid_before = DATE_ADD(NOW(), INTERVAL 1 SECOND) WHERE id=?',
    [userId]
  )
  clearUserCache(userId)
}

/**
 * Look up the accounts currently using an address, either as their verified
 * email or as a pending change.
 * @param {string} email - already normalized
 * @returns {Promise<Array<{id: number, username: string}>>}
 */
async function _usersWithEmail (email) {
  return query(
    'SELECT id, username FROM user WHERE LOWER(email)=? OR LOWER(pending_email)=?',
    [email, email]
  )
}

/**
 * Put an address on the block list and immediately log out whoever is using
 * it. Blocking an already-blocked address only refreshes the reason, but the
 * session invalidation runs again so it is also the "kick them out now" button.
 * @param {object} args
 * @param {string} args.email
 * @param {string|null} [args.reason]
 * @param {number|null} [args.blockedByUserId]
 * @returns {Promise<{email: string, affectedUsers: Array<{id: number, username: string}>}>}
 */
export async function blockEmail ({ email, reason = null, blockedByUserId = null }) {
  const normalized = normalizeEmail(email)
  if (!normalized) throw new Error('Email is required')
  await query(
    `INSERT INTO blocked_email (email, reason, blocked_by_user_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE reason=VALUES(reason), blocked_by_user_id=VALUES(blocked_by_user_id)`,
    [normalized, reason || null, blockedByUserId]
  )
  const affectedUsers = await _usersWithEmail(normalized)
  for (const user of affectedUsers) {
    await invalidateUserSessions(user.id)
  }
  return { email: normalized, affectedUsers }
}

/**
 * Remove an address from the block list. Already-invalidated sessions stay
 * invalid — the user simply logs in again.
 * @param {string} email
 * @returns {Promise<{email: string, removed: boolean}>}
 */
export async function unblockEmail (email) {
  const normalized = normalizeEmail(email)
  if (!normalized) throw new Error('Email is required')
  const result = await query('DELETE FROM blocked_email WHERE email=?', [normalized])
  return { email: normalized, removed: (result?.affectedRows ?? 0) > 0 }
}

/**
 * The full block list, newest first, annotated with the username of the
 * account that is (still) using the address, if any.
 * @returns {Promise<Array>}
 */
export async function listBlockedEmails () {
  return query(
    `SELECT be.id, be.email, be.reason, be.created_at,
            admin.username AS blocked_by,
            u.id AS user_id, u.username
     FROM blocked_email be
     LEFT JOIN user admin ON admin.id = be.blocked_by_user_id
     LEFT JOIN user u ON LOWER(u.email) = be.email OR LOWER(u.pending_email) = be.email
     ORDER BY be.created_at DESC`
  )
}
