import { query } from '../lib/database.js'
import { sendPushNotifications } from '../lib/pushNotification.js'

/**
 * Send push notifications to all iOS users after a game day is calculated
 * @param {number} gameDay
 * @param {number} season
 */
export async function sendGameDayPushNotifications (gameDay, season) {
  try {
    const users = await query(
      "SELECT DISTINCT user_id FROM device_token WHERE platform = 'ios'"
    )
    if (!users.length) return

    const userIds = users.map(u => u.user_id)
    await sendPushNotifications(
      userIds,
      'Game Day Played! ⚽',
      `Season ${season}, Game Day ${gameDay} results are in!`,
      { type: 'GAME_DAY', gameDay, season }
    )
  } catch (e) {
    console.error('[Push] Error sending game day notifications:', e)
  }
}
