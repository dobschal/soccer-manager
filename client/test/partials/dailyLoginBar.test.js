import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getDailyLoginStatus: vi.fn(),
    getLoginStreakLeaderboard: vi.fn(),
    claimDailyLoginReward: vi.fn()
  }
}))
vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../partials/overlay.js', () => ({ showOverlay: vi.fn() }))
vi.mock('../../partials/cardClaimOverlay.js', () => ({ showCardClaimOverlay: vi.fn() }))
// Assert on translation keys rather than the English copy, so wording changes
// don't break these tests.
vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key),
  getLocale: vi.fn(() => 'en')
}))

import { DailyLoginBar } from '../../partials/dailyLoginBar.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { showCardClaimOverlay } from '../../partials/cardClaimOverlay.js'

const MILESTONES = [
  { day: 3, key: 'recovery', actions: [{ action: 'FRESHNESS_5', chance: 50 }, { action: 'FRESHNESS_20', chance: 50 }] },
  { day: 7, key: 'training', actions: [{ action: 'LEVEL_UP_PLAYER_40', chance: 100 }] },
  { day: 15, key: 'special', actions: [{ action: 'SPY', chance: 90 }, { action: 'STAR_PLAYER', chance: 10 }] },
  { day: 23, key: 'youth', actions: [{ action: 'NEW_YOUTH_PLAYER_1', chance: 100 }] },
  { day: 30, key: 'jackpot', actions: [{ action: 'MILLION_BONUS', chance: 70 }, { action: 'STAR_PLAYER', chance: 30 }] }
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
  availableRewards: [],
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
    expect(html.match(/class="daily-login-marker/g)).toHaveLength(5)
    for (const day of [3, 7, 15, 23, 30]) {
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

  it('renders nothing usable without a status', () => {
    const bar = new DailyLoginBar()
    bar.status = null
    expect(bar.template).toBe('<div></div>')
  })
})

describe('DailyLoginBar gift (#501)', () => {
  it('lays a gift over the bar while a reward is waiting', () => {
    const bar = new DailyLoginBar()
    bar.status = status({ availableRewards: [{ day: 3, key: 'recovery' }] })
    const html = bar.template
    expect(html).toContain('daily-login-gift')
    expect(html).toContain('🎁')
  })

  it('counts the rewards once more than one piled up', () => {
    const bar = new DailyLoginBar()
    bar.status = status({ availableRewards: [{ day: 3, key: 'recovery' }, { day: 7, key: 'training' }] })
    expect(bar.template).toContain('daily-login-gift-count')
  })

  it('hides the gift when nothing is collectable', () => {
    const bar = new DailyLoginBar()
    bar.status = status()
    expect(bar.template).not.toContain('daily-login-gift')
  })

  it('grants the card only when the user collects it', async () => {
    const cards = [{ id: 7, action: 'FRESHNESS_10', day: 3, key: 'recovery' }]
    server.claimDailyLoginReward.mockResolvedValue({ cards, claimed: [3], availableRewards: [], limitReached: false })
    const bar = new DailyLoginBar()
    bar.status = status({ availableRewards: [{ day: 3, key: 'recovery' }] })
    bar.update = vi.fn()

    await bar._collectReward()

    expect(server.claimDailyLoginReward).toHaveBeenCalledTimes(1)
    expect(showCardClaimOverlay).toHaveBeenCalledWith(cards)
    expect(bar.update).toHaveBeenCalled()
  })

  it('drops the gift from the bar once the reward was collected', async () => {
    // update() re-renders from this.status without refetching, so the collected
    // state has to be written back — otherwise "collect reward" stays on screen.
    const cards = [{ id: 7, action: 'MILLION_BONUS', day: 30, key: 'jackpot' }]
    server.claimDailyLoginReward.mockResolvedValue({
      cards, claimed: [3, 7, 15, 23, 30], availableRewards: [], limitReached: false
    })
    const bar = new DailyLoginBar()
    bar.status = status({ cycleDay: 30, claimed: [3, 7, 15, 23], availableRewards: [{ day: 30, key: 'jackpot' }] })
    bar.update = vi.fn()

    await bar._collectReward()

    expect(bar.status.availableRewards).toEqual([])
    expect(bar.status.claimed).toEqual([3, 7, 15, 23, 30])
    expect(bar.template).not.toContain('daily-login-gift')
  })

  it('keeps the gift when the server could not hand the card out', async () => {
    server.claimDailyLoginReward.mockResolvedValue({
      cards: [], claimed: [3], availableRewards: [{ day: 7, key: 'training' }], limitReached: true
    })
    const bar = new DailyLoginBar()
    bar.status = status({ availableRewards: [{ day: 7, key: 'training' }] })
    bar.update = vi.fn()

    await bar._collectReward()

    expect(bar.template).toContain('daily-login-gift')
  })

  it('explains a blocked reward instead of opening an empty overlay', async () => {
    server.claimDailyLoginReward.mockResolvedValue({ cards: [], claimed: [], availableRewards: [], limitReached: true })
    const bar = new DailyLoginBar()
    bar.status = status({ availableRewards: [{ day: 3, key: 'recovery' }] })
    bar.update = vi.fn()

    await bar._collectReward()

    expect(showCardClaimOverlay).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('dailyLogin.cardLimitReached', 'error')
  })

  it('ignores a second tap while the first is still running', async () => {
    let resolveClaim
    server.claimDailyLoginReward.mockReturnValue(new Promise(r => { resolveClaim = r }))
    const bar = new DailyLoginBar()
    bar.status = status({ availableRewards: [{ day: 3, key: 'recovery' }] })
    bar.update = vi.fn()

    const first = bar._collectReward()
    await bar._collectReward()
    resolveClaim({ cards: [], claimed: [], availableRewards: [], limitReached: false })
    await first

    expect(server.claimDailyLoginReward).toHaveBeenCalledTimes(1)
  })

  it('reports a failed collect without losing the gift', async () => {
    server.claimDailyLoginReward.mockRejectedValue(new Error('boom'))
    const bar = new DailyLoginBar()
    bar.status = status({ availableRewards: [{ day: 3, key: 'recovery' }] })
    bar.update = vi.fn()

    await bar._collectReward()

    expect(toast).toHaveBeenCalledWith('boom', 'error')
    expect(bar.template).toContain('daily-login-gift')
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
    const html = bar._renderOverlayBody(board({ cycleDay: 30, claimed: [3, 7, 15, 23, 30] }), null)
    expect(html).toContain('dailyLogin.cycleComplete')
    expect(html).not.toContain('dailyLogin.nextReward')
  })
})

describe('DailyLoginBar reward breakdown (#501)', () => {
  it('shows only day and category, not the individual cards and chances', () => {
    const bar = new DailyLoginBar()
    const html = bar._renderRewardItem(MILESTONES[4], [])
    expect(html).toContain('dailyLogin.rewardDay')
    expect(html).toContain('dailyLogin.reward.jackpot')
    expect(html).not.toContain('actionCards.type.millionBonus')
    expect(html).not.toContain('actionCards.type.starPlayer')
    expect(html).not.toContain('dailyLogin.chance')
  })

  it('marks a claimed milestone with a check instead of its category icon', () => {
    const bar = new DailyLoginBar()
    expect(bar._renderRewardItem(MILESTONES[0], [3])).toContain('fa-check-circle')
    expect(bar._renderRewardItem(MILESTONES[0], [])).not.toContain('fa-check-circle')
  })

  it('survives a milestone without a card pool', () => {
    const bar = new DailyLoginBar()
    const html = bar._renderRewardItem({ day: 9, key: 'special' }, [])
    expect(html).toContain('dailyLogin.rewardDay')
    expect(html).toContain('dailyLogin.reward.special')
  })

  it('renders one entry per milestone in the overlay', () => {
    const bar = new DailyLoginBar()
    const html = bar._renderOverlayBody({
      streak: 5,
      cycleDay: 5,
      cycleLength: 30,
      claimed: [3],
      milestones: MILESTONES,
      top: [],
      me: null,
      total: 0
    }, null)
    expect(html.match(/daily-login-reward mb-2/g)).toHaveLength(MILESTONES.length)
  })
})
