import { describe, it, expect, vi } from 'vitest'
import { testData } from '../setup.js'

// Heavy dependencies are irrelevant to the report body markup — stub them.
vi.mock('../../lib/gateway.js', () => ({ server: {} }))
vi.mock('../../partials/overlay.js', () => ({ showOverlay: vi.fn() }))
vi.mock('../../partials/emblem.js', () => ({ renderEmblem: () => '<span class="emblem"></span>' }))
vi.mock('../../partials/lineup.js', () => ({ Lineup: class { toString () { return '<div class="lineup"></div>' } } }))
vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../i18n/index.js', () => ({ t: (key) => key }))
vi.mock('../../lib/delay.js', () => ({ delay: () => Promise.resolve() }))

import { spyReportBodyHtml } from '../../partials/spyOverlay.js'

describe('spyReportBodyHtml', () => {
  it('#513 shows the motivating-speech banner when the spied team has it active', () => {
    const team = testData.team({ name: 'Spied FC', motivating_speech_active: 1 })
    const html = spyReportBodyHtml(team, [])
    expect(html).toContain('spy.motivatingSpeechActive')
    expect(html).toContain('fa-bullhorn')
  })

  it('#513 hides the motivating-speech banner when it is not active', () => {
    const team = testData.team({ name: 'Spied FC', motivating_speech_active: 0 })
    const html = spyReportBodyHtml(team, [])
    expect(html).not.toContain('spy.motivatingSpeechActive')
  })
})
