import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => `[${key}]`)
}))

function installXhrMock (responses) {
  class FakeXhr {
    constructor () {
      this.status = 0
      this.responseText = ''
      this.onload = null
      this.onerror = null
    }
    open (method, url) { this.url = url }
    send () {
      queueMicrotask(() => {
        const body = responses[this.url]
        if (body === undefined) {
          this.onerror?.()
          return
        }
        this.status = 200
        this.responseText = body
        this.onload?.()
      })
    }
  }
  const original = globalThis.XMLHttpRequest
  globalThis.XMLHttpRequest = FakeXhr
  return () => { globalThis.XMLHttpRequest = original }
}

describe('actionCardSvg', () => {
  let restoreXhr

  afterEach(() => {
    restoreXhr?.()
    vi.resetModules()
  })

  it('substitutes both BODY1 and BODY2 in new-youth-player SVGs', async () => {
    restoreXhr = installXhrMock({
      'assets/action-cards/new-youth-player-1.svg':
        '<svg><text>{{BODY1}}</text><text>{{BODY2}}</text></svg>',
      'assets/action-cards/new-youth-player-2.svg':
        '<svg><text>{{BODY1}}</text><text>{{BODY2}}</text></svg>',
      'assets/action-cards/new-youth-player-3.svg':
        '<svg><text>{{BODY1}}</text><text>{{BODY2}}</text></svg>'
    })

    const { loadActionCardSvg, renderActionCardSvg } = await import('../../lib/actionCardSvg.js')

    for (const type of ['NEW_YOUTH_PLAYER_1', 'NEW_YOUTH_PLAYER_2', 'NEW_YOUTH_PLAYER_3']) {
      await loadActionCardSvg(type)
      const out = renderActionCardSvg(type)
      expect(out).not.toContain('{{BODY1}}')
      expect(out).not.toContain('{{BODY2}}')
    }
  })

  it('fills the medical treatment card from its own i18n keys', async () => {
    restoreXhr = installXhrMock({
      'assets/action-cards/medical-treatment.svg':
        '<svg><text>{{HEADER}}{{TITLE}}</text><text>{{BODY1}}{{BODY2}}</text><text>{{FOOTER}}</text></svg>'
    })

    const { loadActionCardSvg, renderActionCardSvg } = await import('../../lib/actionCardSvg.js')
    await loadActionCardSvg('MEDICAL_TREATMENT')
    const out = renderActionCardSvg('MEDICAL_TREATMENT')

    expect(out).toContain('[actionCards.svg.medicalTreatment.title]')
    expect(out).toContain('[actionCards.svg.medicalTreatment.body1]')
    expect(out).toContain('[actionCards.svg.medicalTreatment.body2]')
    expect(out).toContain('[actionCards.svg.medicalTreatment.footer]')
    expect(out).not.toContain('{{')
  })

  it('uses the i18n keys body1 and body2 for new-youth-player cards', async () => {
    restoreXhr = installXhrMock({
      'assets/action-cards/new-youth-player-1.svg':
        '<svg><text>{{BODY1}}</text><text>{{BODY2}}</text></svg>'
    })

    const { loadActionCardSvg, renderActionCardSvg } = await import('../../lib/actionCardSvg.js')
    await loadActionCardSvg('NEW_YOUTH_PLAYER_1')
    const out = renderActionCardSvg('NEW_YOUTH_PLAYER_1')

    expect(out).toContain('[actionCards.svg.newYouthPlayer1.body1]')
    expect(out).toContain('[actionCards.svg.newYouthPlayer1.body2]')
  })
})
