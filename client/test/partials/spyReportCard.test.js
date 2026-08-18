import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getLastSpyReport: vi.fn()
  }
}))

vi.mock('../../partials/spyOverlay.js', () => ({
  spyReportBodyHtml: vi.fn(() => '<div class="spy-reveal">BODY</div>')
}))

import { SpyReportCard } from '../../partials/spyReportCard.js'
import { spyReportBodyHtml } from '../../partials/spyOverlay.js'
import { t } from '../../i18n/index.js'

describe('SpyReportCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('template', () => {
    it('renders a hidden placeholder when there is no report', () => {
      const card = new SpyReportCard()
      card._report = null
      expect(card.template).toContain('d-none')
      expect(card.template).not.toContain('spy-report-card')
    })

    it('renders the report body expanded by default', () => {
      const card = new SpyReportCard()
      card._report = { team: testData.team({ name: 'FC Spy' }), players: [] }
      const html = card.template
      expect(html).toContain('spy-report-card')
      expect(html).toContain('BODY')
      expect(spyReportBodyHtml).toHaveBeenCalledOnce()
    })

    it('hides the body when collapsed', () => {
      localStorage.getItem.mockReturnValue('1')
      const card = new SpyReportCard()
      card._report = { team: testData.team(), players: [] }
      const html = card.template
      expect(html).toContain('spy-report-card')
      expect(html).not.toContain('BODY')
      expect(spyReportBodyHtml).not.toHaveBeenCalled()
    })
  })

  describe('events', () => {
    it('marks the collapse button handler optional so the null-report placeholder does not require it', () => {
      const card = new SpyReportCard()
      const keys = Object.keys(card.events)
      expect(keys).toHaveLength(1)
      expect(keys[0]).toMatch(/^\(optional\)/)
    })
  })

  describe('load', () => {
    it('stores the report returned by the server', async () => {
      const report = { team: testData.team(), players: [] }
      const { server } = await import('../../lib/gateway.js')
      server.getLastSpyReport.mockResolvedValue({ report })
      const card = new SpyReportCard()
      await card.load()
      expect(card._report).toEqual(report)
    })

    it('falls back to no report when the request fails', async () => {
      const { server } = await import('../../lib/gateway.js')
      server.getLastSpyReport.mockRejectedValue(new Error('boom'))
      const card = new SpyReportCard()
      await card.load()
      expect(card._report).toBeNull()
    })
  })

  describe('countdown', () => {
    /**
     * @param {number} minutesLeft
     * @returns {SpyReportCard}
     */
    const activeCard = (minutesLeft) => {
      const card = new SpyReportCard()
      card._report = {
        team: testData.team(),
        players: [],
        active: true,
        expiresAt: new Date(Date.now() + minutesLeft * 60_000).toISOString()
      }
      return card
    }

    it('renders how much longer the spy is active', () => {
      // + half a minute so the flooring can't tip to 9h 22min mid-test.
      const card = activeCard(9 * 60 + 23.5)
      expect(card._statusText).toContain('9h 23min')
      expect(card._formatRemaining((9 * 60 + 23) * 60_000)).toBe('9h 23min')
    })

    it('drops the hour part below one hour and falls back to seconds in the last minute', () => {
      const card = activeCard(1)
      expect(card._formatRemaining(23 * 60_000)).toBe('23min')
      expect(card._formatRemaining(42_000)).toBe('42s')
    })

    it('reports an expired spy instead of a countdown', () => {
      const card = new SpyReportCard()
      card._report = { team: testData.team(), players: [], active: false, expiresAt: new Date(Date.now() - 1000).toISOString() }
      expect(card._statusText).toBe(t('spy.expired'))
      expect(card._remainingMs).toBe(0)
    })

    it('only runs timers while the spy is active', () => {
      const card = activeCard(60)
      card._startTimers()
      expect(card._tickInterval).not.toBeNull()
      expect(card._refetchInterval).not.toBeNull()

      card._report.active = false
      card._startTimers()
      expect(card._tickInterval).toBeNull()
      expect(card._refetchInterval).toBeNull()
    })

    it('stops the timers and reloads once the spy has run out', () => {
      const card = activeCard(60)
      card._report.expiresAt = new Date(Date.now() - 1).toISOString()
      card._startTimers()
      const update = vi.spyOn(card, 'update').mockResolvedValue(undefined)

      card._tick()

      expect(card._tickInterval).toBeNull()
      expect(update).toHaveBeenCalledWith(true)
    })

    it('clears the timers when the card leaves the DOM', () => {
      const card = activeCard(60)
      card._startTimers()
      card.onDestroy()
      expect(card._tickInterval).toBeNull()
      expect(card._refetchInterval).toBeNull()
    })
  })

  describe('_refetch', () => {
    /**
     * @param {Object} report
     * @returns {SpyReportCard}
     */
    const mounted = async (report) => {
      const { server } = await import('../../lib/gateway.js')
      server.getLastSpyReport.mockResolvedValue({ report })
      const card = new SpyReportCard()
      card._report = report
      document.body.innerHTML = `<div id="${card._bodyId}">OLD</div><small id="${card._statusId}"></small>`
      return card
    }

    it('leaves the body untouched when nothing changed', async () => {
      const report = {
        team: testData.team({ formation: '4-4-2' }),
        players: [testData.player({ id: 1 })],
        active: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      }
      const card = await mounted(report)

      await card._refetch()

      expect(document.body.innerHTML).toContain('OLD')
      expect(spyReportBodyHtml).not.toHaveBeenCalled()
    })

    it('swaps the body in place when the spied team changed its tactics', async () => {
      const card = await mounted({
        team: testData.team({ formation: '4-4-2' }),
        players: [],
        active: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })
      const { server } = await import('../../lib/gateway.js')
      server.getLastSpyReport.mockResolvedValue({
        report: {
          team: testData.team({ formation: '3-5-2' }),
          players: [],
          active: true,
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        }
      })

      await card._refetch()

      expect(spyReportBodyHtml).toHaveBeenCalledOnce()
      expect(document.body.innerHTML).toContain('BODY')
      expect(document.body.innerHTML).not.toContain('OLD')
    })
  })
})
