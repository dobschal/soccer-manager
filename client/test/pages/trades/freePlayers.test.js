import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getCurrentGameday: vi.fn(),
    getPlayersWithoutTeam: vi.fn(),
    givePlayerContract: vi.fn()
  }
}))

vi.mock('../../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-id'),
  el: vi.fn()
}))

vi.mock('../../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../../../partials/dialog.js', () => ({
  showDialog: vi.fn()
}))

vi.mock('../../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../../partials/table.js', () => ({
  Table: class {
    constructor () {}
    toString () { return '<div class="table-mock"></div>' }
  }
}))

vi.mock('../../../lib/router.js', () => ({
  setQueryParams: vi.fn()
}))

vi.mock('../../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

import { server } from '../../../lib/gateway.js'
import { showDialog } from '../../../partials/dialog.js'
import { FreePlayers } from '../../../pages/trades/freePlayers.js'
import { testData } from '../../setup.js'

describe('FreePlayers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('hiring a free agent', () => {
    it('leaves the refresh to the PLAYER_HIRED server event', async () => {
      const player = testData.player({ id: 42, name: 'Free Agent' })
      showDialog.mockResolvedValue({ ok: true })
      server.givePlayerContract.mockResolvedValue(undefined)

      const page = new FreePlayers()
      page.season = 1
      page.players = [player]
      const update = vi.spyOn(page, 'update').mockResolvedValue(undefined)

      await page._showHireDialog(player)

      expect(server.givePlayerContract).toHaveBeenCalledWith(42)
      // The click handler must not redraw optimistically — see
      // requirements/event-based-updates.md.
      expect(update).not.toHaveBeenCalled()

      await page.serverEvents.PLAYER_HIRED({ playerId: 42, playerName: 'Free Agent' })
      expect(update).toHaveBeenCalledWith(true)
    })

    it('does not sign anything when the confirmation was cancelled', async () => {
      const player = testData.player({ id: 42 })
      showDialog.mockResolvedValue({ ok: false })

      const page = new FreePlayers()
      page.season = 1
      page.players = [player]

      await page._showHireDialog(player)

      expect(server.givePlayerContract).not.toHaveBeenCalled()
    })

    it('drops the signed player when the list is reloaded', async () => {
      const page = new FreePlayers()
      server.getCurrentGameday.mockResolvedValue({ season: 1 })
      server.getPlayersWithoutTeam.mockResolvedValue([testData.player({ id: 43 })])

      page.players = [testData.player({ id: 42 }), testData.player({ id: 43 })]
      await page.load()

      expect(page.players.map(p => p.id)).toEqual([43])
    })
  })
})
