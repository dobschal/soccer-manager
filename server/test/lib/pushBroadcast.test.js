import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))
// The transport is loaded lazily inside the module; stub the config so no APNs
// or FCM client is ever constructed.
vi.mock('../../config.js', () => ({
  config: { APN_KEY_PATH: '', APN_KEY_ID: '', APN_TEAM_ID: '', APN_BUNDLE_ID: 'x', FCM_SERVICE_ACCOUNT_PATH: '' }
}))

import { query } from '../../lib/database.js'
import { sendBroadcastNotification, DEFAULT_BROADCAST_TITLE } from '../../lib/pushNotification.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sendBroadcastNotification titles (#388)', () => {
  const users = [
    { user_id: 1, language: 'en' },
    { user_id: 2, language: 'de' }
  ]

  /**
   * Route the two queries the broadcast makes: the recipient list, then the
   * per-language device-token lookups. Returns the (title, body) pairs the
   * transport layer was asked to deliver.
   * @param {object} titles
   * @returns {Promise<Array>}
   */
  async function runBroadcast (titles) {
    const deliveries = []
    query.mockImplementation(async (sql, params) => {
      const text = String(sql)
      if (text.includes('FROM device_token dt')) return users
      if (text.includes('SELECT token, platform FROM device_token')) {
        deliveries.push({ userIds: params })
        return []
      }
      return []
    })
    await sendBroadcastNotification('English body', 'Deutscher Text', '', titles)
    return deliveries
  }

  it('reaches both language groups', async () => {
    const deliveries = await runBroadcast({ en: 'Title', de: 'Titel' })
    expect(deliveries).toHaveLength(2)
    expect(deliveries.flatMap(d => d.userIds).sort()).toEqual([1, 2])
  })

  it('accepts a broadcast without titles and stays on the app name', async () => {
    // No titles argument at all — the pre-#388 call shape.
    query.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM device_token dt')) return users
      return []
    })
    const result = await sendBroadcastNotification('Body', 'Text', '')
    expect(result.sent).toBe(2)
    expect(DEFAULT_BROADCAST_TITLE).toBe('FootballManager.IO')
  })

  it('reports nothing sent when no device is registered', async () => {
    query.mockResolvedValue([])
    const result = await sendBroadcastNotification('Body', 'Text', '', { en: 'T', de: 'T' })
    expect(result).toEqual({ sent: 0, failed: 0 })
  })

  it('falls back to the English title for a language without its own', async () => {
    query.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM device_token dt')) return users
      return []
    })
    const result = await sendBroadcastNotification('Body', 'Text', '', { en: 'Only English' })
    // Both groups still get delivered; the German one borrows the English title.
    expect(result.sent).toBe(2)
  })
})
