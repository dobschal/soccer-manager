import { query, transaction } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { clearUserCache } from '../lib/userCache.js'
import { config } from '../config.js'
import { sendInactivityWarningEmail } from '../lib/email.js'
import { collectUserUploadFiles, deleteUserContentRows, deleteUserUploadFiles } from './accountDeletionHelper.js'

/**
 * @param {Request} req
 * @returns {Promise<TeamType>}
 */
export async function getTeam (req) {
  if (!req.user) throw new BadRequestError('Not authorised.')
  const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
  if (!team) throw new BadRequestError('Not authorised.')
  return team
}

/**
 * @param {number} id
 * @returns {Promise<TeamType>}
 */
export async function getTeamById (id) {
  const [team] = await query('SELECT * FROM team WHERE id=? LIMIT 1', [id])
  return team
}

/**
 * Days of inactivity at which we email a warning before the user is
 * auto-deleted. The stages are ordered: each cron tick can only advance
 * a user one stage forward (stage 1 → 2), never repeat the same warning.
 */
const INACTIVITY_WARNING_STAGES = [
  { stage: 1, days: 14, daysRemaining: 7 },
  { stage: 2, days: 20, daysRemaining: 1 }
]

/**
 * Email pre-deletion warnings to users approaching the 21-day cutoff,
 * then remove anyone who has finally crossed it. The team is kept with
 * all players/stadium intact and becomes a bot team again.
 *
 * Warning stages live in `user.inactivity_warning_stage`:
 *   0 = nothing sent yet
 *   1 = 7-day notice sent
 *   2 = 1-day notice sent
 * The stage resets to 0 on the next successful login.
 */
export async function cleanupInactiveUsers () {
  for (const { stage, days, daysRemaining } of INACTIVITY_WARNING_STAGES) {
    const dueUsers = await query(
      `SELECT u.id AS user_id, u.username, u.email, u.pending_email, u.language
       FROM user u
       JOIN team t ON t.user_id = u.id
       WHERE COALESCE(u.last_login, u.created_at) < NOW() - INTERVAL ? DAY
         AND COALESCE(u.last_login, u.created_at) >= NOW() - INTERVAL ${config.INACTIVE_USER_DAYS} DAY
         AND u.is_admin = 0
         AND u.inactivity_warning_stage < ?`,
      [days, stage]
    )
    for (const user of dueUsers) {
      const toEmail = user.email || user.pending_email
      if (toEmail) {
        try {
          await sendInactivityWarningEmail({
            toEmail,
            locale: user.language || 'en',
            username: user.username,
            daysRemaining
          })
        } catch (e) {
          console.error(`Failed to send inactivity warning to user ${user.user_id}:`, e)
        }
      }
      await query('UPDATE user SET inactivity_warning_stage=? WHERE id=?', [stage, user.user_id])
    }
    if (dueUsers.length > 0) {
      console.log(`Sent ${dueUsers.length} inactivity warning(s) at stage ${stage} (${daysRemaining}d remaining).`)
    }
  }

  const inactiveUsers = await query(
    `SELECT u.id AS user_id, t.id AS team_id FROM user u JOIN team t ON t.user_id = u.id WHERE COALESCE(u.last_login, u.created_at) < NOW() - INTERVAL ${config.INACTIVE_USER_DAYS} DAY AND u.is_admin = 0`
  )
  for (const { user_id: userId, team_id: teamId } of inactiveUsers) {
    console.log(`Removing inactive user ${userId} from team ${teamId}`)
    // Collect uploaded-image filenames before the rows are deleted so the
    // files can be removed from disk afterwards (not transactional).
    const uploadFiles = await collectUserUploadFiles(userId)
    await transaction(async (txQuery) => {
      // Keep the team (players/stadium intact) but detach it into a bot.
      await txQuery('UPDATE team SET user_id = NULL, description = NULL WHERE id = ?', [teamId])
      // Remove all user-scoped personal data (UGC, social graph, tokens, …).
      await deleteUserContentRows(txQuery, userId)
      await txQuery('DELETE FROM user WHERE id = ?', [userId])
    })
    deleteUserUploadFiles(uploadFiles)
    clearUserCache(userId)
  }
  if (inactiveUsers.length > 0) {
    console.log(`Cleaned up ${inactiveUsers.length} inactive user(s).`)
  }
}
