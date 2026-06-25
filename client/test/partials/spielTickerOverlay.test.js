import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({ server: {} }))
vi.mock('../../partials/overlay.js', () => ({ showOverlay: vi.fn() }))
vi.mock('../../lib/html.js', () => ({ el: vi.fn(), generateId: () => 'id' }))
vi.mock('../../i18n/index.js', () => ({ t: (k) => k }))
vi.mock('../../lib/nativeReview.js', () => ({ maybeRequestReviewAfterWin: vi.fn() }))

import { buildTickerEvents, isSpielTickerSeen, logHasMinutes } from '../../partials/spielTickerOverlay.js'

describe('spielTickerOverlay helpers (#402)', () => {
  describe('buildTickerEvents', () => {
    it('keeps goals, cards and chances and sorts them by minute', () => {
      const log = [
        { minute: 80, goal: true, player: 1 },
        { passes: true },
        { minute: 10, keeperHolds: true, player: 2 },
        { minute: 45, yellowCard: true, player: 3 },
        { minute: 30, redCard: true, player: 4 },
        { minute: 5, lostBall: true }
      ]
      const events = buildTickerEvents(log)
      expect(events.map(e => e.minute)).toEqual([10, 30, 45, 80])
    })

    it('defaults a missing minute to 0', () => {
      const events = buildTickerEvents([{ goal: true, player: 1 }])
      expect(events[0].minute).toBe(0)
    })

    it('returns an empty array for non-array input', () => {
      expect(buildTickerEvents(null)).toEqual([])
      expect(buildTickerEvents(undefined)).toEqual([])
    })
  })

  describe('logHasMinutes', () => {
    it('is true when at least one notable event has a numeric minute', () => {
      expect(logHasMinutes([
        { keeperHolds: true, player: 2 },
        { minute: 80, goal: true, player: 1 }
      ])).toBe(true)
    })

    it('is false when notable events carry no minute (pre-minute-tracking games)', () => {
      expect(logHasMinutes([
        { goal: true, player: 1 },
        { keeperHolds: true, player: 2 },
        { yellowCard: true, player: 3 }
      ])).toBe(false)
    })

    it('is false for empty or non-array input', () => {
      expect(logHasMinutes([])).toBe(false)
      expect(logHasMinutes(null)).toBe(false)
    })

    it('ignores minutes on non-notable events', () => {
      expect(logHasMinutes([{ passes: true, minute: 5 }])).toBe(false)
    })
  })

  describe('isSpielTickerSeen', () => {
    let store
    beforeEach(() => {
      store = {}
      // This file runs in the node environment, so `window` is undefined; the
      // code reads `window.localStorage`, hence stub the whole `window` object.
      vi.stubGlobal('window', {
        localStorage: {
          getItem: (k) => store[k] ?? null,
          setItem: (k, v) => { store[k] = v }
        }
      })
    })
    afterEach(() => vi.unstubAllGlobals())

    it('is false until the flag is stored', () => {
      expect(isSpielTickerSeen(1, 2, 3)).toBe(false)
      store.spielTickerSeen_1_2_3 = '1'
      expect(isSpielTickerSeen(1, 2, 3)).toBe(true)
    })
  })
})
