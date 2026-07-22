import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../partials/playerImage.js', () => ({
  renderPlayerImage: vi.fn(() => Promise.resolve(''))
}))

vi.mock('../../partials/levelBadge.js', () => ({
  renderLevelBadge: vi.fn(() => '')
}))

vi.mock('../../lib/gateway.js', () => ({
  server: {
    updateBenchSubstitutionMode: vi.fn().mockResolvedValue({ success: true })
  },
  showServerError: vi.fn()
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

import { BenchSlot } from '../../partials/benchSlot.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'

describe('BenchSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('template', () => {
    it('renders the empty-slot placeholder when no player is set', () => {
      const slot = new BenchSlot('BENCH_MID', 'Midfield', null, testData.team())
      expect(slot.template).toContain('bench-slot--empty')
      expect(slot.template).toContain('Midfield')
    })

    it('renders the player when set', () => {
      const player = testData.player({ id: 7, name: 'Alice Anderson', position: 'CM', freshness: 0.9 })
      const slot = new BenchSlot('BENCH_MID', 'Midfield', player, testData.team())
      expect(slot.template).toContain('data-player-id="7"')
      expect(slot.template).not.toContain('bench-slot--empty')
    })
  })

  describe('BENCH_CHANGED server event', () => {
    it('swaps the player in when a BENCH_CHANGED event targets this slot', () => {
      const slot = new BenchSlot('BENCH_MID', 'Midfield', null, testData.team())
      const updateSpy = vi.spyOn(slot, 'update').mockImplementation(() => {})

      const newPlayer = testData.player({ id: 42 })
      slot.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: newPlayer,
        displacedPlayerId: null,
        vacatedLineupPosition: null
      })

      expect(slot.player).toBe(newPlayer)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('clears the player if this slot loses its current occupant to another slot', () => {
      const current = testData.player({ id: 42 })
      const slot = new BenchSlot('BENCH_MID', 'Midfield', current, testData.team())
      const updateSpy = vi.spyOn(slot, 'update').mockImplementation(() => {})

      // Same player was just re-assigned to a different slot — we lose them.
      slot.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_ATT',
        player: current,
        displacedPlayerId: null,
        vacatedLineupPosition: null
      })

      expect(slot.player).toBeNull()
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('is a no-op for BENCH_CHANGED events unrelated to this slot', () => {
      const current = testData.player({ id: 42 })
      const slot = new BenchSlot('BENCH_MID', 'Midfield', current, testData.team())
      const updateSpy = vi.spyOn(slot, 'update').mockImplementation(() => {})

      slot.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_ATT',
        player: testData.player({ id: 99 }),
        displacedPlayerId: null,
        vacatedLineupPosition: null
      })

      expect(slot.player).toBe(current)
      expect(updateSpy).not.toHaveBeenCalled()
    })
  })
})
