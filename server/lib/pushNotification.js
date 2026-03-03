import { query } from './database.js'
import { config } from '../config.js'
import apn from '@parse/node-apn'

/** @type {import('@parse/node-apn').Provider|null} */
let apnProvider = null

/**
 * @returns {import('@parse/node-apn').Provider|null}
 */
function getApnProvider () {
  if (apnProvider) return apnProvider
  if (!config.APN_KEY_PATH || !config.APN_KEY_ID || !config.APN_TEAM_ID) {
    return null
  }
  apnProvider = new apn.Provider({
    token: {
      key: config.APN_KEY_PATH,
      keyId: config.APN_KEY_ID,
      teamId: config.APN_TEAM_ID
    },
    production: config.APN_PRODUCTION
  })
  return apnProvider
}

/**
 * Send push notifications to iOS users
 * @param {number[]} userIds
 * @param {string} title
 * @param {string} body
 * @param {object} [data]
 */
export async function sendPushNotifications (userIds, title, body, data = {}) {
  try {
    const provider = getApnProvider()
    if (!provider) {
      console.warn('[Push] APNs not configured (set APN_KEY_PATH, APN_KEY_ID, APN_TEAM_ID), skipping')
      return
    }
    if (!userIds.length) return

    const placeholders = userIds.map(() => '?').join(',')
    const tokens = await query(
      `SELECT token FROM device_token WHERE user_id IN (${placeholders}) AND platform = 'ios'`,
      userIds
    )
    if (!tokens.length) return

    const notification = new apn.Notification()
    notification.alert = { title, body }
    notification.sound = 'default'
    notification.badge = 1
    notification.topic = config.APN_BUNDLE_ID
    notification.payload = data

    const tokenStrings = tokens.map(t => t.token)
    const result = await provider.send(notification, tokenStrings)

    if (result.failed.length > 0) {
      console.error(`[Push] ${result.failed.length} notifications failed`)
      for (const failure of result.failed) {
        const reason = failure.response?.reason
        if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
          await query('DELETE FROM device_token WHERE token = ?', [failure.device])
        }
      }
    }
    if (result.sent.length > 0) {
      console.log(`[Push] Sent ${result.sent.length} push notifications`)
    }
  } catch (e) {
    console.error('[Push] Error sending push notifications:', e)
  }
}

/**
 * Send a push notification directly to a device token (for testing)
 * @param {string} deviceToken
 * @param {string} message
 * @returns {Promise<{sent: number, failed: number, failureReason: string|null}>}
 */
export async function sendTestPushNotification (deviceToken, message) {
  const provider = getApnProvider()
  if (!provider) {
    throw new Error('APNs not configured (set APN_KEY_PATH, APN_KEY_ID, APN_TEAM_ID)')
  }

  const notification = new apn.Notification()
  notification.alert = { title: 'Test Notification', body: message }
  notification.sound = 'default'
  notification.topic = config.APN_BUNDLE_ID

  const result = await provider.send(notification, deviceToken)
  const failure = result.failed[0]
  return {
    sent: result.sent.length,
    failed: result.failed.length,
    failureReason: failure?.response?.reason ?? failure?.error?.message ?? null
  }
}

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
