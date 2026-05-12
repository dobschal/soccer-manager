import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTicksUntilGameDay } from '../../helper/gameDayHelper.js'

describe('getTicksUntilGameDay', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 0 when target is the lowest unplayed game_day (plays at imminent tick)', async () => {
    query.mockResolvedValueOnce([{ game_day: 5 }])

    expect(await getTicksUntilGameDay(0, 5)).toBe(0)
  })

  it('returns ordinal position in sorted distinct unplayed game_days', async () => {
    // {33 cup, 35 league} — target 35 plays 1 tick after the cup, not 2.
    query.mockResolvedValueOnce([{ game_day: 33 }, { game_day: 35 }])

    expect(await getTicksUntilGameDay(4, 35)).toBe(1)
  })

  it('returns 0 when target game_day has no unplayed rows at or before it', async () => {
    query.mockResolvedValueOnce([])

    expect(await getTicksUntilGameDay(0, 10)).toBe(0)
  })

  it('handles longer gaps where multiple game_days are pending', async () => {
    query.mockResolvedValueOnce([
      { game_day: 33 },
      { game_day: 35 },
      { game_day: 36 },
      { game_day: 38 }
    ])

    expect(await getTicksUntilGameDay(4, 38)).toBe(3)
  })
})
