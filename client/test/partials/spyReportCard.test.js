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
})
