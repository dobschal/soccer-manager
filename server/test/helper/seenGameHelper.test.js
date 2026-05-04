import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import { markGameAsSeen, getSeenGameIds } from '../../helper/seenGameHelper.js'

describe('seenGameHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('markGameAsSeen', () => {
    it('inserts a seen-game row for the team and game', async () => {
      query.mockResolvedValue({ insertId: 1 })
      await markGameAsSeen(7, 42)
      expect(query).toHaveBeenCalledWith(
        'INSERT IGNORE INTO seen_game (team_id, game_id) VALUES (?, ?)',
        [7, 42]
      )
    })

    it('does nothing when teamId is missing', async () => {
      await markGameAsSeen(0, 42)
      expect(query).not.toHaveBeenCalled()
    })

    it('does nothing when gameId is missing', async () => {
      await markGameAsSeen(7, 0)
      expect(query).not.toHaveBeenCalled()
    })
  })

  describe('getSeenGameIds', () => {
    it('returns the set of seen game IDs from the database', async () => {
      query.mockResolvedValue([{ game_id: 100 }, { game_id: 102 }])
      const result = await getSeenGameIds(7, [100, 101, 102])
      expect(query).toHaveBeenCalledWith(
        'SELECT game_id FROM seen_game WHERE team_id = ? AND game_id IN (?)',
        [7, [100, 101, 102]]
      )
      expect(result).toBeInstanceOf(Set)
      expect([...result]).toEqual([100, 102])
    })

    it('returns an empty set when no game IDs are passed', async () => {
      const result = await getSeenGameIds(7, [])
      expect(query).not.toHaveBeenCalled()
      expect([...result]).toEqual([])
    })

    it('returns an empty set when teamId is missing', async () => {
      const result = await getSeenGameIds(0, [1, 2])
      expect(query).not.toHaveBeenCalled()
      expect([...result]).toEqual([])
    })
  })
})
