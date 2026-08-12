import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({ server: {} }))
vi.mock('../../partials/overlay.js', () => ({ showOverlay: vi.fn() }))
vi.mock('../../lib/html.js', () => ({ el: vi.fn(), generateId: () => 'id' }))
vi.mock('../../i18n/index.js', () => ({ t: (k) => k }))
vi.mock('../../lib/nativeReview.js', () => ({ maybeRequestReviewAfterWin: vi.fn() }))

import { server } from '../../lib/gateway.js'
import {
  buildTickerEvents, cardReason, eventType, injuryDetail, isBreakEvent, isSpielTickerSeen,
  logHasMinutes, maybeShowSpielTickerOverlay, EVENT_ICONS,
  DUEL_MIN_GAP_MINUTES, DUEL_MIN_STREAK, HALF_TIME_MINUTE,
  RECOVERY_MIN_GAP_MINUTES, RECOVERY_MIN_STREAK
} from '../../partials/spielTickerOverlay.js'

describe('spielTickerOverlay helpers (#402)', () => {
  describe('buildTickerEvents', () => {
    it('keeps goals, cards and chances and sorts them by minute', () => {
      const log = [
        { minute: 80, goal: true, player: 1 },
        { passes: true },
        { minute: 10, keeperHolds: true, player: 2 },
        { minute: 45, yellowCard: true, player: 3 },
        { minute: 30, redCard: true, player: 4 },
        // Below the streak bar, so it is not a notable recovery (#539).
        { minute: 5, lostBall: true, streak: 0 }
      ]
      const events = buildTickerEvents(log)
      // The kick-off and half-time cards are added on top of the log (#539).
      expect(events.filter(e => !e.halfTime && !e.kickOff).map(e => e.minute)).toEqual([10, 30, 45, 80])
      expect(events.some(e => e.halfTime)).toBe(true)
    })

    it('defaults a missing minute to 0', () => {
      const events = buildTickerEvents([{ goal: true, player: 1 }])
      expect(events.find(e => e.goal).minute).toBe(0)
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

  describe('maybeShowSpielTickerOverlay', () => {
    let store
    beforeEach(() => {
      store = {}
      vi.stubGlobal('window', {
        localStorage: {
          getItem: (k) => store[k] ?? null,
          setItem: (k, v) => { store[k] = v }
        }
      })
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      delete server.getResult
    })

    it('does not mark the day seen when no ticker could be shown', async () => {
      // A cup bye / forfeit has empty details, so showSpielTickerOverlay bails
      // out. The per-day flag must stay unset so a renderable game can still
      // trigger the ticker on a later visit (#402).
      server.getResult = vi.fn().mockResolvedValue({ result: { details: '{}', isForfeit: false } })
      const params = { season: 7, gameDay: 1, myTeamId: 1, lastGame: { id: 5 } }

      expect(await maybeShowSpielTickerOverlay(params)).toBe(false)
      expect(isSpielTickerSeen(7, 1, 5)).toBe(false)
      // A second attempt is still allowed (not blocked by a burnt flag).
      expect(await maybeShowSpielTickerOverlay(params)).toBe(false)
      expect(server.getResult).toHaveBeenCalledTimes(2)
    })
  })
})

describe('buildTickerEvents extensions (#539)', () => {
  /**
   * @param {number} minute
   * @param {number} streak
   * @returns {object}
   */
  const duel = (minute, streak) => ({ minute, lostBall: true, streak, player: 1, oponentPlayer: 2 })

  it('shows only recoveries that broke up a passing move', () => {
    const events = buildTickerEvents([
      duel(10, 0),
      duel(30, 1),
      duel(50, RECOVERY_MIN_STREAK)
    ])
    const recoveries = events.filter(e => e.recovery)
    expect(recoveries).toHaveLength(1)
    expect(recoveries[0].minute).toBe(50)
  })

  it('thins recoveries out to one per gap window', () => {
    const log = [10, 11, 12, 13].map(m => duel(m, 5))
    const recoveries = buildTickerEvents(log).filter(e => e.recovery)
    expect(recoveries).toHaveLength(1)
  })

  it('lets recoveries through again once the gap has passed', () => {
    const log = [duel(10, 5), duel(10 + RECOVERY_MIN_GAP_MINUTES, 5)]
    expect(buildTickerEvents(log).filter(e => e.recovery)).toHaveLength(2)
  })

  it('ignores duels without a minute — those predate the change', () => {
    const events = buildTickerEvents([{ lostBall: true, streak: 9, player: 1, oponentPlayer: 2 }])
    expect(events.filter(e => e.recovery)).toHaveLength(0)
  })

  it('does not count a duel the attacker won as a recovery', () => {
    const events = buildTickerEvents([{ minute: 20, lostBall: false, streak: 9, player: 1, oponentPlayer: 2 }])
    expect(events.filter(e => e.recovery)).toHaveLength(0)
  })

  it('adds a half-time card once the match ran past 45 minutes', () => {
    const events = buildTickerEvents([{ minute: 60, goal: true, player: 1 }])
    const half = events.find(e => e.halfTime)
    expect(half).toBeTruthy()
    expect(half.minute).toBe(HALF_TIME_MINUTE)
  })

  it('omits half time for a match that never reached it', () => {
    const events = buildTickerEvents([{ minute: 20, goal: true, player: 1 }])
    expect(events.some(e => e.halfTime)).toBe(false)
  })

  it('places half time after everything that happened in the 45th minute', () => {
    const events = buildTickerEvents([
      { minute: 45, goal: true, player: 1 },
      { minute: 70, goal: true, player: 2 }
    ])
    const goalIdx = events.findIndex(e => e.minute === 45 && e.goal)
    const halfIdx = events.findIndex(e => e.halfTime)
    expect(halfIdx).toBeGreaterThan(goalIdx)
  })

  it('announces extra time for a cup match that went past 90', () => {
    const events = buildTickerEvents(
      [{ minute: 100, goal: true, player: 1 }],
      { extraTime: true }
    )
    expect(events.some(e => e.extraTimeStart)).toBe(true)
  })

  it('closes with the penalty shootout when there was one', () => {
    const shootout = { goalsTeamA: 4, goalsTeamB: 3, shots: [{ scored: true }] }
    const events = buildTickerEvents(
      [{ minute: 120, keeperHolds: true, player: 1 }],
      { extraTime: true, penaltyShootout: shootout }
    )
    expect(events[events.length - 1].penaltyShootout).toBe(true)
    expect(events[events.length - 1].shootout).toBe(shootout)
  })

  it('folds injuries into the timeline', () => {
    const events = buildTickerEvents(
      [{ minute: 60, goal: true, player: 1 }],
      { injuries: [{ playerId: 7, playerName: 'Max', injuryType: 'sprain', injuryDays: 3, minute: 20 }] }
    )
    const injury = events.find(e => e.injury)
    expect(injury).toMatchObject({ minute: 20, player: 7, injuryDays: 3 })
    // Sorted before the 60th-minute goal.
    expect(events.indexOf(injury)).toBeLessThan(events.findIndex(e => e.goal))
  })

  it('skips injuries without a minute', () => {
    const events = buildTickerEvents([], { injuries: [{ playerId: 7, injuryDays: 3 }] })
    expect(events.some(e => e.injury)).toBe(false)
  })

  it('opens the feed with a kick-off card', () => {
    const events = buildTickerEvents([{ minute: 60, goal: true, player: 1 }])
    expect(events[0].kickOff).toBe(true)
    expect(events[0].minute).toBe(0)
  })

  it('puts the kick-off ahead of an event logged in minute 0', () => {
    const events = buildTickerEvents([{ minute: 0, goal: true, player: 1 }])
    expect(events[0].kickOff).toBe(true)
    expect(events[1].goal).toBe(true)
  })

  it('shows won duels that ended a long move', () => {
    const won = (minute, streak) => ({ minute, lostBall: false, streak, player: 1, oponentPlayer: 2 })
    const events = buildTickerEvents([
      won(10, DUEL_MIN_STREAK - 1),
      won(30, DUEL_MIN_STREAK)
    ])
    const duels = events.filter(e => e.wonDuel)
    expect(duels).toHaveLength(1)
    expect(duels[0].minute).toBe(30)
  })

  it('thins won duels out to one per gap window', () => {
    const won = (minute) => ({ minute, lostBall: false, streak: 20, player: 1, oponentPlayer: 2 })
    const log = [10, 11, 12].map(won)
    expect(buildTickerEvents(log).filter(e => e.wonDuel)).toHaveLength(1)
    const spaced = [10, 10 + DUEL_MIN_GAP_MINUTES].map(won)
    expect(buildTickerEvents(spaced).filter(e => e.wonDuel)).toHaveLength(2)
  })

  it('never flags the same duel as both a recovery and a won duel', () => {
    const events = buildTickerEvents([
      { minute: 20, lostBall: true, streak: 20, player: 1, oponentPlayer: 2 }
    ])
    expect(events.filter(e => e.wonDuel)).toHaveLength(0)
    expect(events.filter(e => e.recovery)).toHaveLength(1)
  })

  it('folds substitutions into the timeline', () => {
    const events = buildTickerEvents([{ minute: 80, goal: true, player: 1 }], {
      substitutions: [
        { playerInId: 9, playerInName: 'Neu', playerOutId: 4, playerOutName: 'Alt', reason: 'injury', minute: 62, teamIndex: 0 }
      ]
    })
    const sub = events.find(e => e.substitution)
    expect(sub).toMatchObject({ minute: 62, player: 9, playerOut: 4, playerOutName: 'Alt' })
    expect(events.indexOf(sub)).toBeLessThan(events.findIndex(e => e.goal))
  })

  it('skips substitutions without a minute', () => {
    const events = buildTickerEvents([], { substitutions: [{ playerInId: 9, playerOutId: 4 }] })
    expect(events.some(e => e.substitution)).toBe(false)
  })
})

describe('eventType and isBreakEvent (#539)', () => {
  it('names each new event flavour', () => {
    expect(eventType({ kickOff: true })).toBe('kickOff')
    expect(eventType({ substitution: true })).toBe('substitution')
    expect(eventType({ wonDuel: true })).toBe('duel')
    expect(eventType({ recovery: true })).toBe('recovery')
  })

  it('treats the kick-off as a break so it holds on screen', () => {
    expect(isBreakEvent('kickOff')).toBe(true)
    expect(isBreakEvent('halfTime')).toBe(true)
    expect(isBreakEvent('goal')).toBe(false)
    expect(isBreakEvent('substitution')).toBe(false)
  })

  it('prefers the goal over a duel flag on the same entry', () => {
    expect(eventType({ goal: true, wonDuel: true })).toBe('goal')
  })
})

describe('injuryDetail (#539)', () => {
  it('names the injury the player suffered', () => {
    // The mocked `t` returns the key, so the injury name resolves to its key.
    expect(injuryDetail({ injuryType: 'muscle_strain', injuryDays: 3 }))
      .toBe('spielTicker.injuryDetailNamed')
  })

  it('falls back to the duration when the type is unknown', () => {
    expect(injuryDetail({ injuryDays: 2 })).toBe('spielTicker.injuryDetail')
  })

  it('treats a missing duration as zero', () => {
    expect(injuryDetail({})).toBe('spielTicker.injuryDetail')
  })
})

describe('cardReason (#539)', () => {
  const players = { 5: { name: 'Foulopfer' } }

  it('names a second booking', () => {
    expect(cardReason({ redCard: true, secondYellow: true }, players)).toBe('spielTicker.reasonSecondYellow')
  })

  it('names the player who was fouled', () => {
    expect(cardReason({ yellowCard: true, foulOn: 5 }, players)).toBe('spielTicker.reasonFoulOn')
  })

  it('falls back to serious foul play for a straight red without a known victim', () => {
    expect(cardReason({ redCard: true }, players)).toBe('spielTicker.reasonStraightRed')
  })

  it('falls back to a plain foul for a booking without a known victim', () => {
    expect(cardReason({ yellowCard: true }, players)).toBe('spielTicker.reasonFoul')
  })

  it('ignores a foul target that is not in the squad list', () => {
    expect(cardReason({ yellowCard: true, foulOn: 999 }, players)).toBe('spielTicker.reasonFoul')
  })
})

describe('EVENT_ICONS (#539)', () => {
  it('gives every event flavour its own icon', () => {
    const icons = Object.values(EVENT_ICONS)
    expect(new Set(icons).size).toBe(icons.length)
  })

  it('shows two figures for a duel and swapping arrows for a recovery', () => {
    expect(EVENT_ICONS.duel).toContain('fa-users')
    expect(EVENT_ICONS.recovery).toContain('fa-exchange')
  })

  it('covers every type buildTickerEvents can produce', () => {
    for (const type of ['goal', 'red', 'yellow', 'chance', 'injury', 'recovery', 'duel', 'substitution']) {
      expect(EVENT_ICONS[type]).toBeTruthy()
    }
  })
})
