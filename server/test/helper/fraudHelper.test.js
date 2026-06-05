import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { getSuspiciousActions, __testing } from '../../helper/fraudHelper.js'
import { query } from '../../lib/database.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fraudHelper._approxMarketValueByLevel', () => {
  it('returns ~40M for level 100', () => {
    expect(__testing._approxMarketValueByLevel(100)).toBe(40_000_000)
  })

  it('halves approximately every 10 levels', () => {
    const v100 = __testing._approxMarketValueByLevel(100)
    const v90 = __testing._approxMarketValueByLevel(90)
    expect(v90).toBeLessThan(v100)
    expect(v90 / v100).toBeCloseTo(0.5, 1)
  })

  it('returns null for null level', () => {
    expect(__testing._approxMarketValueByLevel(null)).toBe(null)
  })
})

describe('fraudHelper._approxMarketValue (with age)', () => {
  it('matches the level-only value when no age data is available', () => {
    expect(__testing._approxMarketValue(100, null, null)).toBe(40_000_000)
  })

  it('depreciates by 15% per year above 22', () => {
    // age = tradeSeason - carrierStartSeason + 16
    const v22 = __testing._approxMarketValue(100, 6, 0)   // age 22
    const v26 = __testing._approxMarketValue(100, 10, 0)  // age 26
    expect(v22).toBe(40_000_000)
    // four years of × 0.85
    expect(v26 / v22).toBeCloseTo(0.85 ** 4, 2)
  })

  it('returns null for null level', () => {
    expect(__testing._approxMarketValue(null, 10, 0)).toBe(null)
  })
})

describe('fraudHelper.getSuspiciousActions', () => {
  it('returns an empty result when no detectors trigger', async () => {
    // 3 detectors → 3 query batches. Each returns an empty set.
    query.mockResolvedValue([])

    const result = await getSuspiciousActions({ limit: 10, offset: 0 })

    expect(result).toEqual({ rows: [], total: 0 })
  })

  it('flags pairs of users sharing the same IP', async () => {
    query
      // _detectSharedIp
      .mockResolvedValueOnce([
        { user_id: 1, username: 'alice', last_login: '2026-06-03T10:00:00Z', team_name: 'FC Alice', ip_web: '1.2.3.4', ip_ios: null, ip_android: null },
        { user_id: 2, username: 'bob', last_login: '2026-06-02T10:00:00Z', team_name: 'FC Bob', ip_web: '1.2.3.4', ip_ios: null, ip_android: null },
        { user_id: 3, username: 'carol', last_login: '2026-06-01T10:00:00Z', team_name: 'FC Carol', ip_web: '9.9.9.9', ip_ios: null, ip_android: null }
      ])
      // _detectSharedDevice
      .mockResolvedValueOnce([])
      // _detectFrequentTrades
      .mockResolvedValueOnce([])
      // _detectPriceDeviation
      .mockResolvedValueOnce([])

    const result = await getSuspiciousActions({ limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      type: 'shared_ip',
      description_key: 'admin.fraudDescSharedIp',
      description_params: { ip: '1.2.3.4' },
      user1: { username: 'alice', team_name: 'FC Alice' },
      user2: { username: 'bob', team_name: 'FC Bob' }
    })
  })

  it('flags pairs of users sharing the same device UUID', async () => {
    query
      // _detectSharedIp
      .mockResolvedValueOnce([])
      // _detectSharedDevice
      .mockResolvedValueOnce([
        { device_uuid: 'dev-aaa', user_id: 1, username: 'alice', team_name: 'FC Alice', last_seen: '2026-06-05T10:00:00Z' },
        { device_uuid: 'dev-aaa', user_id: 2, username: 'bob', team_name: 'FC Bob', last_seen: '2026-06-04T10:00:00Z' }
      ])
      // _detectFrequentTrades
      .mockResolvedValueOnce([])
      // _detectPriceDeviation
      .mockResolvedValueOnce([])

    const result = await getSuspiciousActions({ limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.rows[0]).toMatchObject({
      type: 'shared_device',
      description_key: 'admin.fraudDescSharedDevice',
      user1: { username: 'alice', team_name: 'FC Alice' },
      user2: { username: 'bob', team_name: 'FC Bob' }
    })
  })

  it('emits one event per pair when more than two users share an IP', async () => {
    query
      .mockResolvedValueOnce([
        { user_id: 1, username: 'a', last_login: '2026-06-03T10:00:00Z', team_name: 'A', ip_web: '1.1.1.1', ip_ios: null, ip_android: null },
        { user_id: 2, username: 'b', last_login: '2026-06-02T10:00:00Z', team_name: 'B', ip_web: '1.1.1.1', ip_ios: null, ip_android: null },
        { user_id: 3, username: 'c', last_login: '2026-06-01T10:00:00Z', team_name: 'C', ip_web: '1.1.1.1', ip_ios: null, ip_android: null }
      ])
      .mockResolvedValueOnce([]) // _detectSharedDevice
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await getSuspiciousActions({ limit: 10, offset: 0 })

    // 3 users sharing one IP → 3 pairs (a-b, a-c, b-c)
    expect(result.total).toBe(3)
  })

  it('flags frequent-trade pairs with team and user names', async () => {
    // The three detectors run in parallel, so their first queries are dispatched
    // in declaration order before any of them resolve. detectFrequentTrades' team
    // lookup is dispatched only after its aggregate query resolves, so it lands
    // last in the mock sequence.
    query
      // _detectSharedIp
      .mockResolvedValueOnce([])
      // _detectSharedDevice
      .mockResolvedValueOnce([])
      // _detectFrequentTrades aggregate
      .mockResolvedValueOnce([
        { team_a_id: 10, team_b_id: 20, trade_count: 5, last_trade: '2026-06-03T08:00:00Z' }
      ])
      // _detectPriceDeviation
      .mockResolvedValueOnce([])
      // _detectFrequentTrades team lookup
      .mockResolvedValueOnce([
        { id: 10, name: 'FC Alpha', username: 'alpha' },
        { id: 20, name: 'FC Beta', username: 'beta' }
      ])

    const result = await getSuspiciousActions({ limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.rows[0]).toMatchObject({
      type: 'frequent_trades',
      description_key: 'admin.fraudDescFrequentTrades',
      description_params: { count: 5 },
      user1: { username: 'alpha', team_name: 'FC Alpha' },
      user2: { username: 'beta', team_name: 'FC Beta' }
    })
  })

  it('flags trades priced well below the player market value', async () => {
    query
      .mockResolvedValueOnce([]) // _detectSharedIp
      .mockResolvedValueOnce([]) // _detectSharedDevice
      .mockResolvedValueOnce([]) // _detectFrequentTrades
      .mockResolvedValueOnce([
        {
          price: 100,
          player_level: 100, // ~40M value
          created_at: '2026-06-03T09:00:00Z',
          from_team_name: 'Seller FC',
          from_user_id: 1,
          from_username: 'seller',
          to_team_name: 'Buyer FC',
          to_user_id: 2,
          to_username: 'buyer'
        }
      ])

    const result = await getSuspiciousActions({ limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.rows[0]).toMatchObject({
      type: 'undervalued_trade',
      description_key: 'admin.fraudDescUndervaluedTrade',
      user1: { username: 'seller', team_name: 'Seller FC' },
      user2: { username: 'buyer', team_name: 'Buyer FC' }
    })
    expect(result.rows[0].description_params.price).toBe(100)
    expect(result.rows[0].description_params.value).toBe(40_000_000)
  })

  it('does not flag aged players whose fair value is well below the level-only estimate', async () => {
    // A level-100 age-30 player: level-only value is 40M, but real value
    // after 8 years of × 0.85 is ~9.06M. Selling for 5M is 45% under the
    // real value — within the 50% threshold — and must NOT trigger.
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          price: 5_500_000,
          player_level: 100,
          trade_season: 14,
          carrier_start_season: 0, // age = 14 - 0 + 16 = 30
          created_at: '2026-06-03T09:00:00Z',
          from_team_name: 'Seller FC',
          from_user_id: 1,
          from_username: 'seller',
          to_team_name: 'Buyer FC',
          to_user_id: 2,
          to_username: 'buyer'
        }
      ])

    const result = await getSuspiciousActions({ limit: 10, offset: 0 })

    expect(result.total).toBe(0)
  })

  it('flags trades priced well above the player market value', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          price: 100_000_000, // 2.5× of 40M
          player_level: 100,
          created_at: '2026-06-03T09:00:00Z',
          from_team_name: 'Seller FC',
          from_user_id: 1,
          from_username: 'seller',
          to_team_name: 'Buyer FC',
          to_user_id: 2,
          to_username: 'buyer'
        }
      ])

    const result = await getSuspiciousActions({ limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.rows[0].type).toBe('overvalued_trade')
  })

  it('ignores trades within reasonable price range', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          price: 30_000_000,
          player_level: 100,
          created_at: '2026-06-03T09:00:00Z',
          from_team_name: 'Seller',
          from_user_id: 1,
          from_username: 'seller',
          to_team_name: 'Buyer',
          to_user_id: 2,
          to_username: 'buyer'
        }
      ])

    const result = await getSuspiciousActions({ limit: 10, offset: 0 })

    expect(result.total).toBe(0)
  })

  it('skips price deviation on low-value players to avoid noise', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          price: 1,
          player_level: 1, // very low value, well under PRICE_DEVIATION_MIN_VALUE
          created_at: '2026-06-03T09:00:00Z',
          from_team_name: 'Seller',
          from_user_id: 1,
          from_username: 'seller',
          to_team_name: 'Buyer',
          to_user_id: null,
          to_username: null
        }
      ])

    const result = await getSuspiciousActions({ limit: 10, offset: 0 })

    expect(result.total).toBe(0)
  })

  it('sorts events by time descending and paginates correctly', async () => {
    query
      // shared IP: 2 pairs across 2 IPs
      .mockResolvedValueOnce([
        { user_id: 1, username: 'a', last_login: '2026-06-01T00:00:00Z', team_name: 'A', ip_web: '1.1.1.1', ip_ios: null, ip_android: null },
        { user_id: 2, username: 'b', last_login: '2026-06-02T00:00:00Z', team_name: 'B', ip_web: '1.1.1.1', ip_ios: null, ip_android: null },
        { user_id: 3, username: 'c', last_login: '2026-06-04T00:00:00Z', team_name: 'C', ip_web: '2.2.2.2', ip_ios: null, ip_android: null },
        { user_id: 4, username: 'd', last_login: '2026-06-05T00:00:00Z', team_name: 'D', ip_web: '2.2.2.2', ip_ios: null, ip_android: null }
      ])
      .mockResolvedValueOnce([]) // _detectSharedDevice
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const page1 = await getSuspiciousActions({ limit: 1, offset: 0 })
    const page2 = await getSuspiciousActions({ limit: 1, offset: 1 })

    // need to re-mock for the second call since they're separate invocations
    expect(page1.total).toBe(2)
    expect(page1.rows).toHaveLength(1)
    // Page1 should be the most recent (c/d pair, last_login 2026-06-05)
    expect(page1.rows[0].user1.username === 'c' || page1.rows[0].user2.username === 'c').toBe(true)

    expect(page2.rows).toHaveLength(0) // because we exhausted the mocks
  })

  it('returns ISO time strings on the page', async () => {
    query
      .mockResolvedValueOnce([
        { user_id: 1, username: 'a', last_login: '2026-06-03T10:00:00Z', team_name: 'A', ip_web: '1.1.1.1', ip_ios: null, ip_android: null },
        { user_id: 2, username: 'b', last_login: '2026-06-02T10:00:00Z', team_name: 'B', ip_web: '1.1.1.1', ip_ios: null, ip_android: null }
      ])
      .mockResolvedValueOnce([]) // _detectSharedDevice
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await getSuspiciousActions({ limit: 10, offset: 0 })

    expect(typeof result.rows[0].time).toBe('string')
    expect(result.rows[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
