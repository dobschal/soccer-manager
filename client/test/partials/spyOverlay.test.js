import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { testData } from '../setup.js'

// Heavy dependencies are irrelevant to the report body markup — stub them.
const { server } = vi.hoisted(() => ({ server: { getNextGame: vi.fn(), searchTeams: vi.fn() } }))
vi.mock('../../lib/gateway.js', () => ({ server }))
vi.mock('../../partials/overlay.js', () => ({
  // Mount the body into the document so the picker can find its elements.
  showOverlay: vi.fn((title, subtitle, text) => {
    document.body.insertAdjacentHTML('beforeend', `<div class="overlay">${text}</div>`)
    return { onClose: vi.fn(), remove: vi.fn() }
  })
}))
vi.mock('../../partials/emblem.js', () => ({ renderEmblem: () => '<span class="emblem"></span>' }))
vi.mock('../../partials/lineup.js', () => ({ Lineup: class { toString () { return '<div class="lineup"></div>' } } }))
vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../i18n/index.js', () => ({ t: (key) => key }))
vi.mock('../../lib/delay.js', () => ({ delay: () => Promise.resolve() }))

import { spyReportBodyHtml, showSpyOverlay } from '../../partials/spyOverlay.js'

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

describe('spy overlay team search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    server.getNextGame.mockResolvedValue({ opponent: null })
    server.searchTeams.mockResolvedValue({ teams: [testData.team({ id: 7, name: 'Found FC' })] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Wait for pending promises while fake timers are active. */
  const flush = async () => {
    await vi.advanceTimersByTimeAsync(400)
  }

  const openPicker = async () => {
    void showSpyOverlay({ onConfirm: vi.fn() })
    await flush()
    return document.querySelector('.spy-overlay input')
  }

  it('keeps the focused search input alive while typing below the search threshold', async () => {
    const input = await openPicker()
    expect(input).toBeTruthy()

    input.focus()
    input.value = 'a'
    input.dispatchEvent(new Event('input'))
    await flush()

    // Same node, still focused, character intact — a full body rerender would
    // have replaced it and closed the mobile keyboard.
    expect(document.querySelector('.spy-overlay input')).toBe(input)
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('a')
  })

  it('keeps the focused search input alive when results come back', async () => {
    const input = await openPicker()

    input.focus()
    input.value = 'Found'
    input.dispatchEvent(new Event('input'))
    await flush()

    expect(document.querySelector('.spy-overlay input')).toBe(input)
    expect(document.activeElement).toBe(input)
    expect(document.body.innerHTML).toContain('Found FC')
  })

  it('ignores a slow response for an outdated query', async () => {
    const input = await openPicker()

    let resolveSlow
    server.searchTeams.mockReturnValueOnce(new Promise(resolve => { resolveSlow = resolve }))
    input.value = 'old'
    input.dispatchEvent(new Event('input'))
    await vi.advanceTimersByTimeAsync(300)

    server.searchTeams.mockResolvedValueOnce({ teams: [testData.team({ id: 9, name: 'New FC' })] })
    input.value = 'new'
    input.dispatchEvent(new Event('input'))
    await flush()

    resolveSlow({ teams: [testData.team({ id: 8, name: 'Stale FC' })] })
    await flush()

    expect(document.body.innerHTML).toContain('New FC')
    expect(document.body.innerHTML).not.toContain('Stale FC')
  })
})
