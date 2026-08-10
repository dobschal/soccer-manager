import { prepareSeason } from '../prepare-season.js'
import { calculateGames } from '../play-game-day.js'
import { makeBotMoves } from '../bot-move.js'
import { BadRequestError } from '../lib/errors.js'
import { cleanupOldFreePlayers } from '../helper/playerHelper.js'
import { cleanupIOCPlayers, fillMarketGaps, iocAutoAcceptBuyOffers, iocBuyFromUsers } from '../helper/overseaClubHelper.js'
import { sendBroadcastNotification } from '../lib/pushNotification.js'
import { sendAdminMessageEmail } from '../lib/email.js'
import { query, transaction } from '../lib/database.js'
import { clearUserCache } from '../lib/userCache.js'
import { collectStatistics, getStatistics } from '../helper/statisticsHelper.js'
import { getSuspiciousActions, SUSPICIOUS_ACTION_TYPES } from '../helper/fraudHelper.js'
import { blockEmail, invalidateUserSessions, listBlockedEmails, unblockEmail } from '../helper/emailBlockHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getServerStats } from '../helper/serverStatsHelper.js'
import { getTeamById } from '../helper/teamHelper.js'
import { updateTeamBalance } from '../helper/financeHelper.js'
import { getUserLocale, t } from '../i18n/index.js'
import { sendToUser } from '../lib/websocket.js'
import { SERVER_EVENTS } from '../../client/lib/serverEvents.js'

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
  'MILLION_BONUS',
  'STAR_PLAYER',
  'MOTIVATING_SPEECH'
]

/**
 * Card types an admin may add to / remove from a single team via the team
 * page. Superset of {@link GIFTABLE_ACTION_CARD_TYPES} — SPY is not part of
 * the mass-gift / referral dropdowns but can be handed out individually.
 */
export const ADMIN_MANAGEABLE_ACTION_CARD_TYPES = [
  ...GIFTABLE_ACTION_CARD_TYPES, 'SPY', 'MEDICAL_TREATMENT'
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
    // Isolate each step so one failing job doesn't abort the whole game day
    // (mirrors the CRON handler in api.js).
    let newSeasonCreated = false
    try { newSeasonCreated = await prepareSeason() } catch (e) { console.error('prepareSeason failed:', e) }
    if (newSeasonCreated) {
      console.log('⏸️ New season created — skipping game calculation this tick.')
    } else {
      try { await calculateGames({ skipPushNotifications: true }) } catch (e) { console.error('calculateGames failed:', e) }
    }
    try { await makeBotMoves() } catch (e) { console.error('makeBotMoves failed:', e) }
    try { await cleanupOldFreePlayers() } catch (e) { console.error('cleanupOldFreePlayers failed:', e) }
    try { await cleanupIOCPlayers() } catch (e) { console.error('cleanupIOCPlayers failed:', e) }
    try { await fillMarketGaps() } catch (e) { console.error('fillMarketGaps failed:', e) }
    try { await iocBuyFromUsers() } catch (e) { console.error('iocBuyFromUsers failed:', e) }
    try { await iocAutoAcceptBuyOffers() } catch (e) { console.error('iocAutoAcceptBuyOffers failed:', e) }
    console.log('Game day calculation completed.')
    return { success: true }
  },

  /**
   * Send a broadcast push notification to all users (admin only).
   *
   * Each language carries its own title and subtitle (#388); the title is what
   * the device shows in bold, the subtitle is the notification body. Titles are
   * optional — left empty, the app name is used, which is what the notification
   * looked like before.
   *
   * @param {string} titleEn - English title, '' to fall back to the app name
   * @param {string} messageEn - English subtitle / body
   * @param {string} titleDe - German title, '' to fall back to the app name
   * @param {string} messageDe - German subtitle / body
   * @param {string} [deepLink] - optional URL hash to open on tap, e.g. "#club?sub_page=buildings" (#330)
   * @param {Request} req
   * @returns {Promise<{sent: number, failed: number}>}
   */
  async broadcastNotification (titleEn, messageEn, titleDe, messageDe, deepLink, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof messageEn !== 'string' || !messageEn.trim()) {
      throw new BadRequestError('English message is required')
    }
    if (typeof messageDe !== 'string' || !messageDe.trim()) {
      throw new BadRequestError('German message is required')
    }
    const cleanDeepLink = typeof deepLink === 'string' ? deepLink.trim() : ''
    const titles = {
      en: typeof titleEn === 'string' ? titleEn.trim() : '',
      de: typeof titleDe === 'string' ? titleDe.trim() : ''
    }
    return sendBroadcastNotification(messageEn.trim(), messageDe.trim(), cleanDeepLink, titles)
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
   * List reported users for admin review (admin only). Open reports first,
   * newest first (#421).
   * @param {Request} req
   * @returns {Promise<{reports: Array}>}
   */
  async getReportedUsers (req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const reports = await query(`
      SELECT r.id, r.reason, r.status, r.created_at, r.resolved_at,
             reporter.id AS reporter_id, reporter.username AS reporter_username,
             reported.id AS reported_id, reported.username AS reported_username
      FROM user_report r
      JOIN user reporter ON reporter.id = r.reporter_user_id
      JOIN user reported ON reported.id = r.reported_user_id
      ORDER BY (r.status = 'open') DESC, r.created_at DESC
      LIMIT 200
    `)
    return { reports }
  },

  /**
   * Mark a user report as resolved (admin only) (#421).
   * @param {number} reportId
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async resolveUserReport (reportId, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const id = Number(reportId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestError('Invalid report id')
    }
    await query("UPDATE user_report SET status='resolved', resolved_at=NOW() WHERE id=?", [id])
    return { success: true }
  },

  /**
   * List all blocked email addresses (admin only).
   * @param {Request} req
   * @returns {Promise<{blocked: Array}>}
   */
  async getBlockedEmails (req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    return { blocked: await listBlockedEmails() }
  },

  /**
   * Block an email address (admin only). Registration and login with this
   * address are refused from here on, and any account currently using it is
   * logged out immediately.
   * @param {string} email
   * @param {string} [reason]
   * @param {Request} req
   * @returns {Promise<{success: boolean, email: string, affectedUsers: Array}>}
   */
  async blockEmailAddress (email, reason, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof email !== 'string' || !email.trim()) {
      throw new BadRequestError('Email is required')
    }
    const safeReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 255) : null
    const result = await blockEmail({
      email,
      reason: safeReason,
      blockedByUserId: req.user.id
    })
    console.log(
      `Admin "${req.user.username}" blocked email "${result.email}" ` +
      `(${result.affectedUsers.length} account(s) logged out)`
    )
    return { success: true, ...result }
  },

  /**
   * Remove an email address from the block list (admin only).
   * @param {string} email
   * @param {Request} req
   * @returns {Promise<{success: boolean, removed: boolean}>}
   */
  async unblockEmailAddress (email, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof email !== 'string' || !email.trim()) {
      throw new BadRequestError('Email is required')
    }
    const result = await unblockEmail(email)
    console.log(`Admin "${req.user.username}" unblocked email "${result.email}"`)
    return { success: true, ...result }
  },

  /**
   * Revoke all existing logins of a user (admin only) without blocking their
   * email — useful for a stolen token or as a softer measure than a block.
   * @param {string} username
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async invalidateUserLogin (username, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof username !== 'string' || !username.trim()) {
      throw new BadRequestError('Username is required')
    }
    const [user] = await query('SELECT id FROM user WHERE username=? LIMIT 1', [username.trim()])
    if (!user) {
      throw new BadRequestError(`User "${username}" not found`)
    }
    await invalidateUserSessions(user.id)
    console.log(`Admin "${req.user.username}" revoked the login of "${username}"`)
    return { success: true }
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
   * Optionally narrowed by detector `type` and/or a free-text `search` over
   * the involved usernames and team names (#488).
   * @param {number} [page] - 1-based page number
   * @param {number} [pageSize]
   * @param {string} [type] - one of SUSPICIOUS_ACTION_TYPES, '' for all
   * @param {string} [search] - matches username or team name of either party
   * @param {Request} req
   * @returns {Promise<{rows: Array, total: number, page: number, pageSize: number, types: string[]}>}
   */
  async getSuspiciousActions (page, pageSize, type, search, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const safePageSize = Math.max(1, Math.min(50, Math.floor(Number(pageSize) || 10)))
    const safePage = Math.max(1, Math.floor(Number(page) || 1))
    const safeType = SUSPICIOUS_ACTION_TYPES.includes(type) ? type : ''
    const safeSearch = typeof search === 'string' ? search.slice(0, 100) : ''
    const { rows, total } = await getSuspiciousActions({
      limit: safePageSize,
      offset: (safePage - 1) * safePageSize,
      type: safeType,
      search: safeSearch
    })
    return { rows, total, page: safePage, pageSize: safePageSize, types: SUSPICIOUS_ACTION_TYPES }
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
  },

  /**
   * Get current host stats: CPU usage per core, memory, swap, disk usage
   * (admin only). Values are sampled at request time.
   * @param {Request} req
   * @returns {Promise<object>}
   */
  async getServerStats (req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    return getServerStats()
  },

  /**
   * Unplayed action cards of a single team (admin only). Powers the admin
   * section on the team page. Cards are grouped by action + state so pending
   * (unclaimed) gifts stay distinguishable from the cards the user already
   * holds.
   * @param {number} teamId
   * @param {Request} req
   * @returns {Promise<{actionCards: Array<{action: string, state: string, count: number}>, types: Array<string>}>}
   */
  async adminGetTeamActionCards (teamId, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const team = await getTeamById(Number(teamId))
    if (!team) throw new BadRequestError('Team not found')
    const rows = await query(
      "SELECT action, state, COUNT(*) AS count FROM action_card WHERE team_id=? AND played=0 AND state IN ('received','pending') GROUP BY action, state ORDER BY action ASC",
      [team.id]
    )
    return {
      actionCards: rows.map(r => ({ action: r.action, state: r.state, count: Number(r.count) })),
      types: ADMIN_MANAGEABLE_ACTION_CARD_TYPES
    }
  },

  /**
   * Give one action card of the given type to a single team (admin only).
   * The card lands directly in the user's hand (state 'received').
   * @param {number} teamId
   * @param {string} action
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async adminAddActionCard (teamId, action, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof action !== 'string' || !ADMIN_MANAGEABLE_ACTION_CARD_TYPES.includes(action)) {
      throw new BadRequestError('Invalid action card type')
    }
    const team = await getTeamById(Number(teamId))
    if (!team) throw new BadRequestError('Team not found')
    const { season } = await getGameDayAndSeason()
    await query('INSERT INTO action_card (team_id, action, played, state, season) VALUES (?, ?, 0, ?, ?)', [
      team.id,
      action,
      'received',
      season
    ])
    if (team.user_id) sendToUser(team.user_id, SERVER_EVENTS.ACTION_CARDS_CHANGED.name)
    return { success: true }
  },

  /**
   * Remove one unplayed action card of the given type/state from a team
   * (admin only). Deletes the oldest matching card.
   * @param {number} teamId
   * @param {string} action
   * @param {string} state - 'received' or 'pending'
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async adminRemoveActionCard (teamId, action, state, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    if (typeof action !== 'string' || !action) {
      throw new BadRequestError('Invalid action card type')
    }
    const cardState = state === 'pending' ? 'pending' : 'received'
    const team = await getTeamById(Number(teamId))
    if (!team) throw new BadRequestError('Team not found')
    const [card] = await query(
      'SELECT id FROM action_card WHERE team_id=? AND action=? AND played=0 AND state=? ORDER BY id ASC LIMIT 1',
      [team.id, action, cardState]
    )
    if (!card) throw new BadRequestError('No such action card on this team')
    await query('DELETE FROM action_card WHERE id=?', [card.id])
    if (team.user_id) sendToUser(team.user_id, SERVER_EVENTS.ACTION_CARDS_CHANGED.name)
    return { success: true }
  },

  /**
   * Set a team's balance to an absolute value (admin only). The difference is
   * booked through the regular finance log so the change stays traceable in
   * the user's finances page.
   * @param {number} teamId
   * @param {number} balance
   * @param {Request} req
   * @returns {Promise<{success: boolean, balance: number}>}
   */
  async adminSetTeamBalance (teamId, balance, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const newBalance = Math.round(Number(balance))
    if (!Number.isFinite(newBalance)) {
      throw new BadRequestError('Invalid balance')
    }
    const team = await getTeamById(Number(teamId))
    if (!team) throw new BadRequestError('Team not found')
    const diff = newBalance - team.balance
    if (diff === 0) return { success: true, balance: newBalance }
    const { gameDay, season } = await getGameDayAndSeason()
    const locale = await getUserLocale(team.user_id)
    await updateTeamBalance(team, diff, t('finance.adminAdjustment', {}, locale), gameDay, season)
    return { success: true, balance: team.balance }
  }
}
