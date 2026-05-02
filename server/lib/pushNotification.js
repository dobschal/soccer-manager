import { readFileSync } from 'fs'
import { query } from './database.js'
import { config } from '../config.js'
import apn from '@parse/node-apn'
import admin from 'firebase-admin'

/** @type {import('@parse/node-apn').Provider|null} */
let apnProvider = null

/** @type {import('firebase-admin').app.App|null} */
let fcmApp = null

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
 * @returns {import('firebase-admin').app.App|null}
 */
function getFcmApp () {
  if (fcmApp) return fcmApp
  if (!config.FCM_SERVICE_ACCOUNT_PATH) return null
  try {
    const serviceAccount = JSON.parse(readFileSync(config.FCM_SERVICE_ACCOUNT_PATH, 'utf-8'))
    fcmApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    }, 'fcm')
    return fcmApp
  } catch (e) {
    console.error('[Push] Failed to initialize Firebase Admin:', e)
    return null
  }
}

/**
 * Send notifications to a list of FCM (Android) tokens.
 * Removes tokens that the FCM server reports as invalid.
 * @param {string[]} tokens
 * @param {string} title
 * @param {string} body
 * @param {object} [data]
 * @returns {Promise<{sent: number, failed: number, failureReason: string|null}>}
 */
async function sendFcmToTokens (tokens, title, body, data = {}) {
  if (!tokens.length) return { sent: 0, failed: 0, failureReason: null }
  const app = getFcmApp()
  if (!app) {
    console.warn('[Push] FCM not configured (set FCM_SERVICE_ACCOUNT_PATH), skipping')
    return { sent: 0, failed: 0, failureReason: 'FCM not configured' }
  }

  // FCM data payload values must all be strings
  const stringData = {}
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = String(v)
  }

  const messages = tokens.map(token => ({
    token,
    notification: { title, body },
    data: stringData,
    android: {
      priority: 'high',
      notification: { sound: 'default' }
    }
  }))

  const result = await app.messaging().sendEach(messages)

  let firstError = null
  for (let i = 0; i < result.responses.length; i++) {
    const response = result.responses[i]
    if (response.success) continue
    const code = response.error?.code
    if (!firstError) firstError = response.error?.message || code || 'unknown error'
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument'
    ) {
      await query('DELETE FROM device_token WHERE token = ?', [tokens[i]])
    }
  }

  if (result.successCount > 0) {
    console.log(`[Push] Sent ${result.successCount} FCM push notifications`)
  }
  if (result.failureCount > 0) {
    console.error(`[Push] ${result.failureCount} FCM notifications failed (first reason: ${firstError})`)
  }
  return { sent: result.successCount, failed: result.failureCount, failureReason: firstError }
}

/**
 * Send notifications to a list of APNs (iOS) tokens.
 * Removes tokens that APNs reports as invalid.
 * @param {string[]} tokens
 * @param {string} title
 * @param {string} body
 * @param {object} [data]
 * @returns {Promise<{sent: number, failed: number, failureReason: string|null}>}
 */
async function sendApnsToTokens (tokens, title, body, data = {}) {
  if (!tokens.length) return { sent: 0, failed: 0, failureReason: null }
  const provider = getApnProvider()
  if (!provider) {
    console.warn('[Push] APNs not configured (set APN_KEY_PATH, APN_KEY_ID, APN_TEAM_ID), skipping')
    return { sent: 0, failed: 0, failureReason: 'APNs not configured' }
  }

  const notification = new apn.Notification()
  notification.alert = { title, body }
  notification.sound = 'default'
  notification.badge = 1
  notification.topic = config.APN_BUNDLE_ID
  notification.payload = data

  const result = await provider.send(notification, tokens)

  let firstError = null
  if (result.failed.length > 0) {
    for (const failure of result.failed) {
      const reason = failure.response?.reason ?? failure.error?.message ?? null
      if (!firstError) firstError = reason
      if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
        await query('DELETE FROM device_token WHERE token = ?', [failure.device])
      }
    }
    console.error(`[Push] ${result.failed.length} APNs notifications failed (first reason: ${firstError})`)
  }
  if (result.sent.length > 0) {
    console.log(`[Push] Sent ${result.sent.length} APNs push notifications`)
  }
  return { sent: result.sent.length, failed: result.failed.length, failureReason: firstError }
}

/**
 * Send push notifications to users on all platforms.
 * @param {number[]} userIds
 * @param {string} title
 * @param {string} body
 * @param {object} [data]
 */
export async function sendPushNotifications (userIds, title, body, data = {}) {
  try {
    if (!userIds.length) return

    const placeholders = userIds.map(() => '?').join(',')
    const rows = await query(
      `SELECT token, platform FROM device_token WHERE user_id IN (${placeholders})`,
      userIds
    )
    if (!rows.length) return

    const iosTokens = rows.filter(r => r.platform === 'ios').map(r => r.token)
    const androidTokens = rows.filter(r => r.platform === 'android').map(r => r.token)

    await Promise.all([
      sendApnsToTokens(iosTokens, title, body, data),
      sendFcmToTokens(androidTokens, title, body, data)
    ])
  } catch (e) {
    console.error('[Push] Error sending push notifications:', e)
  }
}

/**
 * Clear the badge count for a user's iOS devices. Android has no equivalent badge concept.
 * @param {number} userId
 */
export async function clearBadge (userId) {
  try {
    const provider = getApnProvider()
    if (!provider) return
    const tokens = await query(
      "SELECT token FROM device_token WHERE user_id = ? AND platform = 'ios'",
      [userId]
    )
    if (!tokens.length) return
    const notification = new apn.Notification()
    notification.badge = 0
    notification.topic = config.APN_BUNDLE_ID
    notification.pushType = 'alert'
    notification.priority = 5
    await provider.send(notification, tokens.map(t => t.token))
  } catch (e) {
    console.error('[Push] Error clearing badge:', e)
  }
}

/**
 * Send a push notification to all users with device tokens, grouped by language.
 * @param {string} messageEn - English message text
 * @param {string} messageDe - German message text
 * @returns {Promise<{sent: number, failed: number}>}
 */
export async function sendBroadcastNotification (messageEn, messageDe) {
  const users = await query(
    `SELECT DISTINCT dt.user_id, COALESCE(u.language, 'en') as language
     FROM device_token dt
     JOIN user u ON u.id = dt.user_id
     WHERE dt.platform IN ('ios', 'android')`
  )
  if (!users.length) return { sent: 0, failed: 0 }

  const messages = { en: messageEn, de: messageDe }
  const byLanguage = {}
  for (const user of users) {
    const lang = user.language || 'en'
    if (!byLanguage[lang]) byLanguage[lang] = []
    byLanguage[lang].push(user.user_id)
  }

  let totalSent = 0
  let totalFailed = 0
  for (const [lang, userIds] of Object.entries(byLanguage)) {
    const body = messages[lang] || messages.en
    await sendPushNotifications(userIds, 'FootballManager.IO', body)
    totalSent += userIds.length
  }

  return { sent: totalSent, failed: totalFailed }
}

/**
 * Send a push notification directly to a device token (for testing).
 * @param {string} deviceToken
 * @param {string} message
 * @param {string} [platform='ios'] - 'ios' or 'android'
 * @returns {Promise<{sent: number, failed: number, failureReason: string|null}>}
 */
export async function sendTestPushNotification (deviceToken, message, platform = 'ios') {
  if (platform === 'android') {
    return sendFcmToTokens([deviceToken], 'Test Notification', message)
  }
  return sendApnsToTokens([deviceToken], 'Test Notification', message)
}
