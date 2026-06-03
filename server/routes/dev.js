import { prepareSeason } from '../prepare-season.js'
import { calculateGames } from '../play-game-day.js'
import { makeBotMoves } from '../bot-move.js'
import { BadRequestError } from '../lib/errors.js'
import { cleanupOldFreePlayers } from '../helper/playerHelper.js'
import { cleanupIOCPlayers, fillMarketGaps, iocAutoAcceptBuyOffers, iocBuyUndervaluedPlayers } from '../helper/overseaClubHelper.js'
import { sendBroadcastNotification } from '../lib/pushNotification.js'
import { sendAdminMessageEmail } from '../lib/email.js'
import { query, transaction } from '../lib/database.js'
import { clearUserCache } from '../lib/userCache.js'
import { collectStatistics, getStatistics } from '../helper/statisticsHelper.js'
import { getSuspiciousActions } from '../helper/fraudHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'

const PERMANENT_ADMIN = 'Emmo'

export const GIFTABLE_ACTION_CARD_TYPES = [
  'LEVEL_UP_PLAYER_40',
  'LEVEL_UP_PLAYER_70',
  'LEVEL_UP_PLAYER_100',
  'FRESHNESS_5',
  'FRESHNESS_10',
  'FRESHNESS_20',
  'NEW_YOUTH_PLAYER_1',
  'NEW_YOUTH_PLAYER_2',
  'NEW_YOUTH_PLAYER_3',
  'BONUS_100K',
  'STAR_PLAYER',
  'MOTIVATING_SPEECH'
]

export default {
  /**
   * Manually triggers the CRON job (admin only)
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async triggerGameDay (req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    console.log('Manually triggered game day calculation...')
    const newSeasonCreated = await prepareSeason()
    if (newSeasonCreated) {
      console.log('⏸️ New season created — skipping game calculation this tick.')
    } else {
      await calculateGames({ skipPushNotifications: true })
    }
    await makeBotMoves()
    await cleanupOldFreePlayers()
    await cleanupIOCPlayers()
    await fillMarketGaps()
    await iocBuyUndervaluedPlayers()
    await iocAutoAcceptBuyOffers()
    console.log('Game day calculation completed.')
    return { success: true }
  },

  /**
   * Send a broadcast push notification to all users (admin only)
   * @param {string} messageEn - English message
   * @param {string} messageDe - German message
   * @param {Request} req
   * @returns {Promise<{sent: number, failed: number}>}
   */
  async broadcastNotification (messageEn, messageDe, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof messageEn !== 'string' || !messageEn.trim()) {
      throw new BadRequestError('English message is required')
    }
    if (typeof messageDe !== 'string' || !messageDe.trim()) {
      throw new BadRequestError('German message is required')
    }
    return sendBroadcastNotification(messageEn.trim(), messageDe.trim())
  },

  /**
   * Gift one pending action card of the given type to every team that has a
   * user assigned (admin only). The card appears as the claim overlay the
   * next time the user opens the app.
   * @param {string} action - One of {@link GIFTABLE_ACTION_CARD_TYPES}
   * @param {Request} req
   * @returns {Promise<{success: boolean, count: number}>}
   */
  async giftActionCardToAll (action, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof action !== 'string' || !GIFTABLE_ACTION_CARD_TYPES.includes(action)) {
      throw new BadRequestError('Invalid action card type')
    }
    const teams = await query('SELECT id FROM team WHERE user_id IS NOT NULL')
    if (teams.length === 0) return { success: true, count: 0 }
    const { season } = await getGameDayAndSeason()
    const values = teams.map(t => [t.id, action, 0, 'pending', season])
    await query(
      'INSERT INTO action_card (team_id, action, played, state, season) VALUES ?',
      [values]
    )
    return { success: true, count: teams.length }
  },

  /**
   * Delete a user by username (admin only). Emmo cannot be deleted.
   * @param {string} username
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async adminDeleteUser (username, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof username !== 'string' || !username.trim()) {
      throw new BadRequestError('Username is required')
    }
    if (username === PERMANENT_ADMIN) {
      throw new BadRequestError(`User "${PERMANENT_ADMIN}" cannot be deleted`)
    }
    const [user] = await query('SELECT * FROM user WHERE username = ?', [username])
    if (!user) {
      throw new BadRequestError(`User "${username}" not found`)
    }
    const [team] = await query('SELECT * FROM team WHERE user_id = ?', [user.id])

    await transaction(async (txQuery) => {
      if (team) {
        await txQuery('DELETE FROM player_history WHERE player_id IN (SELECT id FROM player WHERE team_id=?)', [team.id])
        await txQuery('DELETE FROM player_season_stats WHERE player_id IN (SELECT id FROM player WHERE team_id=?)', [team.id])
        await txQuery('DELETE FROM trade_history WHERE from_team_id=? OR to_team_id=?', [team.id, team.id])
        await txQuery('DELETE FROM trade_offer WHERE from_team_id=? OR player_id IN (SELECT id FROM player WHERE team_id=?)', [team.id, team.id])
        await txQuery('DELETE FROM player WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM youth_player WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM action_card WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM finance_log WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM log_message WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM building WHERE team_id=?', [team.id])
        await txQuery('DELETE FROM sponsor WHERE team_id=?', [team.id])
        const [stadium] = await txQuery('SELECT id FROM stadium WHERE team_id=?', [team.id])
        if (stadium) {
          await txQuery('DELETE FROM stadium_construction_history WHERE stadium_id=?', [stadium.id])
        }
        await txQuery('DELETE FROM stadium WHERE team_id=?', [team.id])
        await txQuery('UPDATE team SET user_id=NULL, description=NULL, coach_since=NULL WHERE id=?', [team.id])
      }
      await txQuery('DELETE FROM device_token WHERE user_id=?', [user.id])
      await txQuery('DELETE FROM forum_comment WHERE user_id=?', [user.id])
      await txQuery('DELETE FROM forum_post_like WHERE user_id=?', [user.id])
      await txQuery('DELETE FROM forum_post WHERE user_id=?', [user.id])
      await txQuery('DELETE FROM user WHERE id=?', [user.id])
    })

    clearUserCache(user.id)
    console.log(`Admin "${req.user.username}" deleted user "${username}"`)
    return { success: true }
  },

  /**
   * Send a free-form email to a user (admin only). Looks the user up by
   * username and uses either their verified email or pending (unverified)
   * email. The greeting, action button (linking to the app) and footer are
   * fixed by the template; `bodyText` is rendered as the body.
   * @param {string} username
   * @param {string} bodyText
   * @param {Request} req
   * @returns {Promise<{success: boolean, sent: boolean}>}
   */
  async sendUserEmail (username, bodyText, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof username !== 'string' || !username.trim()) {
      throw new BadRequestError('Username is required')
    }
    if (typeof bodyText !== 'string' || !bodyText.trim()) {
      throw new BadRequestError('Message text is required')
    }
    const [user] = await query(
      'SELECT id, username, email, pending_email, language FROM user WHERE username = ? LIMIT 1',
      [username.trim()]
    )
    if (!user) {
      throw new BadRequestError(`User "${username}" not found`)
    }
    const toEmail = user.email || user.pending_email
    if (!toEmail) {
      throw new BadRequestError(`User "${username}" has no email address`)
    }
    const locale = user.language === 'de' ? 'de' : 'en'
    const result = await sendAdminMessageEmail({
      toEmail,
      locale,
      username: user.username,
      bodyText: bodyText.trim()
    })
    console.log(`Admin "${req.user.username}" sent email to "${user.username}" <${toEmail}> (sent=${result.sent})`)
    return { success: true, sent: result.sent }
  },

  /**
   * Get list of admin users (admin only)
   * @param {Request} req
   * @returns {Promise<{admins: Array<{id: number, username: string}>}>}
   */
  async getAdmins (req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const admins = await query('SELECT id, username FROM user WHERE is_admin = 1 ORDER BY username')
    return { admins }
  },

  /**
   * Add a user as admin (admin only). User must exist.
   * @param {string} username
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async addAdmin (username, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof username !== 'string' || !username.trim()) {
      throw new BadRequestError('Username is required')
    }
    const [user] = await query('SELECT id FROM user WHERE username = ?', [username])
    if (!user) {
      throw new BadRequestError(`User "${username}" not found`)
    }
    await query('UPDATE user SET is_admin = 1 WHERE id = ?', [user.id])
    clearUserCache(user.id)
    return { success: true }
  },

  /**
   * Remove admin status from a user (admin only). Emmo cannot be removed.
   * @param {string} username
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async removeAdmin (username, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (username === PERMANENT_ADMIN) {
      throw new BadRequestError(`"${PERMANENT_ADMIN}" cannot be removed as admin`)
    }
    const [user] = await query('SELECT id FROM user WHERE username = ?', [username])
    if (!user) {
      throw new BadRequestError(`User "${username}" not found`)
    }
    await query('UPDATE user SET is_admin = 0 WHERE id = ?', [user.id])
    clearUserCache(user.id)
    return { success: true }
  },

  /**
   * Get a paginated list of nightly statistics snapshots (admin only).
   * @param {number} [page] - 1-based page number
   * @param {number} [pageSize]
   * @param {Request} req
   * @returns {Promise<{rows: Array, total: number, page: number, pageSize: number}>}
   */
  async getStatistics (page, pageSize, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const safePageSize = Math.max(1, Math.min(200, Math.floor(Number(pageSize) || 30)))
    const safePage = Math.max(1, Math.floor(Number(page) || 1))
    const { rows, total } = await getStatistics({
      limit: safePageSize,
      offset: (safePage - 1) * safePageSize
    })
    return { rows, total, page: safePage, pageSize: safePageSize }
  },

  /**
   * Manually collect a statistics snapshot now (admin only). Useful when the
   * nightly CRON has not yet produced any rows.
   * @param {Request} req
   * @returns {Promise<{success: boolean, row: object}>}
   */
  async collectStatisticsNow (req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const row = await collectStatistics()
    return { success: true, row }
  },

  /**
   * Get a paginated list of suspicious actions detected across all users
   * (admin only). Surfaces multi-account / price-manipulation patterns:
   * shared IPs, frequent trades between the same pair, and trades priced
   * significantly above or below the player's estimated market value.
   * @param {number} [page] - 1-based page number
   * @param {number} [pageSize]
   * @param {Request} req
   * @returns {Promise<{rows: Array, total: number, page: number, pageSize: number}>}
   */
  async getSuspiciousActions (page, pageSize, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const safePageSize = Math.max(1, Math.min(50, Math.floor(Number(pageSize) || 10)))
    const safePage = Math.max(1, Math.floor(Number(page) || 1))
    const { rows, total } = await getSuspiciousActions({
      limit: safePageSize,
      offset: (safePage - 1) * safePageSize
    })
    return { rows, total, page: safePage, pageSize: safePageSize }
  },

  /**
   * Get the top 10 countries the users (players of the game) come from based
   * on their last known login geolocation (admin only). A user counts once;
   * if they have logged in via multiple platforms, the web country wins, then
   * iOS, then Android.
   * @param {Request} req
   * @returns {Promise<{rows: Array<{country: string, count: number}>}>}
   */
  async getTopCountries (req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const rows = await query(`
      SELECT country, COUNT(*) AS count FROM (
        SELECT COALESCE(last_country_web, last_country_ios, last_country_android) AS country
        FROM user
      ) AS u
      WHERE country IS NOT NULL AND country <> ''
      GROUP BY country
      ORDER BY count DESC, country ASC
      LIMIT 10
    `)
    return { rows: rows.map(r => ({ country: r.country, count: Number(r.count) })) }
  }
}
