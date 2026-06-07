import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/pushNotification.js', () => ({
  sendPushNotifications: vi.fn()
}))

import { query } from '../../lib/database.js'
import { sendPushNotifications } from '../../lib/pushNotification.js'
import { sendGameDayPushNotifications } from '../../helper/pushNotificationHelper.js'

describe('sendGameDayPushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Internal game_day counts cup days too, so the displayed match_day for
  // league match day 34 might be game_day 42. Using gameDay+1 in the push
  // body would render "Spieltag 43" instead of the user-facing "Spieltag 34".
  it('uses the league match_day for league days, not game_day+1', async () => {
    // 1. resolve league match_day for (season, gameDay)
    query.mockResolvedValueOnce([{ match_day: 34 }])
    // 2. user/device lookup
    query.mockResolvedValueOnce([{ user_id: 7, language: 'de' }])

    await sendGameDayPushNotifications(42, 4)

    expect(sendPushNotifications).toHaveBeenCalledTimes(1)
    const [, title, body, data] = sendPushNotifications.mock.calls[0]
    expect(title).toContain('Spieltag gespielt')
    expect(body).toContain('Spieltag 34')
    expect(body).not.toContain('43')
    expect(data).toMatchObject({ type: 'GAME_DAY', gameDay: 42, season: 4, matchDay: 34, kind: 'league' })
  })

  it('falls back to cup match_day with a cup-specific body on cup-only days', async () => {
    // 1. no league game on this game_day
    query.mockResolvedValueOnce([])
    // 2. cup game found
    query.mockResolvedValueOnce([{ match_day: 3 }])
    // 3. user lookup
    query.mockResolvedValueOnce([{ user_id: 7, language: 'de' }])

    await sendGameDayPushNotifications(20, 4)

    expect(sendPushNotifications).toHaveBeenCalledTimes(1)
    const [, , body, data] = sendPushNotifications.mock.calls[0]
    expect(body).toContain('Pokalrunde 3')
    expect(data).toMatchObject({ matchDay: 3, kind: 'cup' })
  })

  it('skips when no played games are found for the game day', async () => {
    query.mockResolvedValueOnce([]) // no league
    query.mockResolvedValueOnce([]) // no cup

    await sendGameDayPushNotifications(99, 0)

    expect(sendPushNotifications).not.toHaveBeenCalled()
  })
})
