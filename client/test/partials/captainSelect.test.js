import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    setCaptain: vi.fn().mockResolvedValue({ success: true })
  },
  showServerError: vi.fn()
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../util/player.js', () => ({
  calculatePlayerAge: vi.fn(() => 20)
}))

import { CaptainSelect } from '../../partials/captainSelect.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'

describe('CaptainSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('template', () => {
    it('lists lineup players as captain options and marks the current captain selected', () => {
      const players = [
        testData.player({ id: 1, name: 'A', in_game_position: 'CM' }),
        testData.player({ id: 2, name: 'B', in_game_position: 'CD' }),
        testData.player({ id: 3, name: 'C', in_game_position: '' }) // reserve — not a candidate
      ]
      const select = new CaptainSelect(players, testData.team({ captain_id: 2 }), 1)
      const html = select.template

      expect(html).toContain('<option value="1"')
      expect(html).toContain('<option value="2"')
      expect(html).toContain('selected')
      expect(html).not.toContain('<option value="3"')
    })
  })

  describe('CAPTAIN_CHANGED server event', () => {
    it('updates team.captain_id and re-renders', () => {
      const team = testData.team({ captain_id: 1 })
      const select = new CaptainSelect([], team, 1)
      const updateSpy = vi.spyOn(select, 'update').mockImplementation(() => {})

      select.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]({ captainId: 5 })

      expect(team.captain_id).toBe(5)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('handles captain being cleared', () => {
      const team = testData.team({ captain_id: 1 })
      const select = new CaptainSelect([], team, 1)
      const updateSpy = vi.spyOn(select, 'update').mockImplementation(() => {})

      select.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]({ captainId: null })

      expect(team.captain_id).toBeNull()
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('BENCH_CHANGED server event', () => {
    it('re-renders when a bench pick vacated a lineup slot (option list changed)', () => {
      const select = new CaptainSelect([], testData.team(), 1)
      const updateSpy = vi.spyOn(select, 'update').mockImplementation(() => {})

      select.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 5 }),
        displacedPlayerId: null,
        vacatedLineupPosition: 'CM'
      })

      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('is a no-op when the bench pick did not touch the lineup', () => {
      const select = new CaptainSelect([], testData.team(), 1)
      const updateSpy = vi.spyOn(select, 'update').mockImplementation(() => {})

      select.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 5 }),
        displacedPlayerId: null,
        vacatedLineupPosition: null
      })

      expect(updateSpy).not.toHaveBeenCalled()
    })
  })

  describe('LINEUP_PLAYER_CHANGED server event', () => {
    it('re-renders so the candidate option list stays in sync with the pitch', () => {
      const select = new CaptainSelect([], testData.team(), 1)
      const updateSpy = vi.spyOn(select, 'update').mockImplementation(() => {})

      select.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CM: testData.player({ id: 5 }) },
        ejectedPlayerId: null,
        emptiedSlot: null,
        freedBenchPosition: null
      })

      expect(updateSpy).toHaveBeenCalledTimes(1)
    })
  })
})
