import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getDailyLoginStatus: vi.fn(),
    getLoginStreakLeaderboard: vi.fn()
  }
}))
vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../partials/overlay.js', () => ({ showOverlay: vi.fn() }))
// Assert on translation keys rather than the English copy, so wording changes
// don't break these tests.
vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key),
  getLocale: vi.fn(() => 'en')
}))

import { DailyLoginBar } from '../../partials/dailyLoginBar.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'

const MILESTONES = [
  { day: 3, key: 'recovery' },
  { day: 7, key: 'training' },
  { day: 15, key: 'special' },
  { day: 30, key: 'youth' }
]

/**
 * @param {object} over
 * @returns {object}
 */
const status = (over = {}) => ({
  streak: 12,
  cycleDay: 12,
  cycleLength: 30,
  claimed: [3, 7],
  milestones: MILESTONES,
  newRewards: [],
  nextMilestone: 15,
  ...over
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DailyLoginBar.load', () => {
  it('stores the status from the server', async () => {
    server.getDailyLoginStatus.mockResolvedValue(status())
    const bar = new DailyLoginBar()
    await bar.load()
    expect(bar.status.streak).toBe(12)
  })

  it('degrades to an empty bar when the request fails', async () => {
    server.getDailyLoginStatus.mockRejectedValue(new Error('boom'))
    const bar = new DailyLoginBar()
    await bar.load()
    expect(bar.status).toBe(null)
    expect(bar.template).toBe('<div></div>')
  })
})

describe('DailyLoginBar.template', () => {
  it('fills the track to the cycle progress', () => {
    const bar = new DailyLoginBar()
    bar.status = status({ cycleDay: 15 })
    expect(bar.template).toContain('width: 50%')
  })

  it('renders a marker for every milestone', () => {
    const bar = new DailyLoginBar()
    bar.status = status()
    const html = bar.template
    expect(html.match(/class="daily-login-marker/g)).toHaveLength(4)
    for (const day of [3, 7, 15, 30]) {
      expect(html).toContain(`left: ${(day / 30) * 100}%`)
    }
  })

  it('marks reached milestones and highlights the next one', () => {
    const bar = new DailyLoginBar()
    bar.status = status({ cycleDay: 12, claimed: [3, 7], nextMilestone: 15 })
    const html = bar.template
    expect(html.match(/daily-login-marker--reached/g)).toHaveLength(2)
    expect(html).toContain('daily-login-marker--next')
  })

  it('never overflows the track for a full cycle', () => {
    const bar = new DailyLoginBar()
    bar.status = status({ cycleDay: 30 })
    expect(bar.template).toContain('width: 100%')
  })

  it('invites a first login when there is no streak yet', () => {
    const bar = new DailyLoginBar()
    bar.status = status({ streak: 0, cycleDay: 0, claimed: [], nextMilestone: 3 })
    expect(bar.template).toContain('dailyLogin.noStreak')
  })

  it('renders nothing usable without a status', () => {
    const bar = new DailyLoginBar()
    bar.status = null
    expect(bar.template).toBe('<div></div>')
  })
})

describe('DailyLoginBar.onMounted', () => {
  it('toasts every reward unlocked by this visit', () => {
    const bar = new DailyLoginBar()
    bar.status = status({ newRewards: [{ day: 3, key: 'recovery', action: 'FRESHNESS_10' }] })
    bar.onMounted()
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][1]).toBe('success')
  })

  it('stays quiet when nothing was unlocked', () => {
    const bar = new DailyLoginBar()
    bar.status = status()
    bar.onMounted()
    expect(toast).not.toHaveBeenCalled()
  })
})

describe('DailyLoginBar overlay body', () => {
  const board = (over = {}) => ({
    streak: 12,
    cycleDay: 12,
    cycleLength: 30,
    claimed: [3, 7],
    milestones: MILESTONES,
    top: [
      { userId: 2, username: 'Ana', streak: 40, rank: 1, isMe: false },
      { userId: 1, username: 'Ben', streak: 12, rank: 2, isMe: true }
    ],
    me: null,
    total: 2,
    ...over
  })

  it('lists the leaderboard and highlights the own row', () => {
    const bar = new DailyLoginBar()
    const html = bar._renderOverlayBody(board(), 'show-all')
    expect(html).toContain('Ana')
    expect(html).toContain('daily-login-row--me')
    expect(html).toContain('dailyLogin.leaderboardTitle')
  })

  it('appends the own rank when outside the shown slice', () => {
    const bar = new DailyLoginBar()
    const html = bar._renderOverlayBody(board({
      top: [{ userId: 2, username: 'Ana', streak: 40, rank: 1, isMe: false }],
      me: { rank: 17, streak: 4 },
      total: 40
    }), 'show-all')
    expect(html).toContain('17.')
    expect(html).toContain('dailyLogin.you')
  })

  it('offers "view all" only when more entries exist', () => {
    const bar = new DailyLoginBar()
    expect(bar._renderOverlayBody(board({ total: 40 }), 'show-all')).toContain('dailyLogin.viewAll')
    expect(bar._renderOverlayBody(board({ total: 2 }), 'show-all')).not.toContain('dailyLogin.viewAll')
    expect(bar._renderOverlayBody(board({ total: 40 }), null)).not.toContain('dailyLogin.viewAll')
  })

  it('shows the empty state when nobody has a streak', () => {
    const bar = new DailyLoginBar()
    const html = bar._renderOverlayBody(board({ top: [], total: 0 }), null)
    expect(html).toContain('dailyLogin.leaderboardEmpty')
  })

  it('announces the completed cycle once past the last milestone', () => {
    const bar = new DailyLoginBar()
    const html = bar._renderOverlayBody(board({ cycleDay: 30, claimed: [3, 7, 15, 30] }), null)
    expect(html).toContain('dailyLogin.cycleComplete')
    expect(html).not.toContain('dailyLogin.nextReward')
  })
})
