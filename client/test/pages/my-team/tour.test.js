import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: { getMyTour: vi.fn(), setMyTourMode: vi.fn(), sendPlayersOnTour: vi.fn(), recallPlayersFromTour: vi.fn() },
  showServerError: vi.fn()
}))
vi.mock('../../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn(), onClose: vi.fn() })),
  showConfirmDialog: vi.fn()
}))
vi.mock('../../../partials/positionBadge.js', () => ({ renderPositionBadge: (p) => `<i>${p}</i>` }))
vi.mock('../../../partials/levelBadge.js', () => ({ renderLevelBadge: (l) => `<b>${l}</b>` }))
vi.mock('../../../partials/wikiInfoIcon.js', () => ({ wikiInfoIcon: () => '' }))
vi.mock('../../../lib/actionCardLabels.js', () => ({ actionCardLabel: (a) => `label:${a}` }))
vi.mock('../../../i18n/index.js', () => ({ t: (key) => key }))
vi.mock('../../../lib/html.js', () => ({ generateId: () => 'id', el: () => null }))

import { TourPage } from '../../../pages/my-team/tour.js'
import { server, showServerError } from '../../../lib/gateway.js'
import { showConfirmDialog } from '../../../partials/overlay.js'

/**
 * @param {object} over
 * @returns {object}
 */
const data = (over = {}) => ({
  mode: 'asia',
  progress: 15,
  target: 30,
  minDays: 3,
  maxDays: 7,
  maxPlayers: 3,
  freeSlots: 2,
  squadAverage: 50,
  tours: [
    { key: 'south_america', reward: [{ action: 'NEW_YOUTH_PLAYER_3', amount: 2 }] },
    { key: 'asia', reward: [{ action: 'MILLION_BONUS', amount: 1 }] },
    { key: 'europe', reward: [{ action: 'LEVEL_UP_PLAYER_100', amount: 5 }] }
  ],
  players: [
    { id: 1, name: 'Keeper', position: 'GK', level: 40, isInjured: false, isSuspended: false, tourDaysLeft: 0, progressPerGameDay: 0.8 },
    { id: 2, name: 'Traveller', position: 'CA', level: 60, isInjured: false, isSuspended: false, tourDaysLeft: 3, canRecall: false, progressPerGameDay: 1.2 },
    { id: 3, name: 'Crocked', position: 'CM', level: 50, isInjured: true, isSuspended: false, tourDaysLeft: 0, progressPerGameDay: 1 }
  ],
  ...over
})

/**
 * @param {object} [over]
 * @returns {TourPage}
 */
function page (over) {
  const p = new TourPage()
  p.data = data(over)
  return p
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TourPage rendering (#535)', () => {
  it('fills the bar to the share of the target reached', () => {
    expect(page().template).toContain('width: 50%')
  })

  it('never overflows the bar past the target', () => {
    expect(page({ progress: 45 }).template).toContain('width: 100%')
  })

  // The card sits on the dark gradient, so its text must be light.
  it('renders the progress card with light text on the dark background', () => {
    expect(page().template).toContain('bg-dark text-white tour-progress-card')
  })

  it('renders all three destinations with their rewards', () => {
    const html = page().template
    for (const key of ['south_america', 'asia', 'europe']) {
      expect(html).toContain(`data-tour-key="${key}"`)
      expect(html).toContain(`assets/tour/${key}.jpg`)
    }
    expect(html).toContain('5× label:LEVEL_UP_PLAYER_100')
  })

  it('marks the chosen destination as active', () => {
    const html = page().template
    const asiaCard = html.slice(html.indexOf('data-tour-key="asia"') - 200, html.indexOf('data-tour-key="asia"') + 200)
    expect(asiaCard).toContain('tour-destination--active')
  })

  it('lists who is away and for how much longer', () => {
    const html = page().template
    expect(html).toContain('Traveller')
    expect(html).toContain('✈️')
    expect(html).toContain('tour.daysLeft')
  })

  it('previews the next match day as a hatched slice of the bar', () => {
    // 1.2 points on a target of 30 → 4% on top of the 50% already filled.
    const html = page().template
    expect(html).toContain('tour-progress__preview')
    expect(html).toContain('width: 4%')
  })

  it('caps the preview at the end of the bar', () => {
    const html = page({ progress: 29.5 }).template
    const preview = html.slice(html.indexOf('tour-progress__preview'))
    // 98.33% filled, so only 1.67% of the bar is left for the 4% the players
    // would otherwise add.
    expect(preview).toMatch(/width: 1\.66\d*%/)
  })

  it('shows no preview when nobody is travelling', () => {
    expect(page({ players: [data().players[0]] }).template).not.toContain('tour-progress__preview')
  })

  it('no longer spells the per-match-day yield out as a number', () => {
    expect(page().template).not.toContain('tour.perGameDay')
  })

  it('says so when nobody is travelling', () => {
    const html = page({ players: [data().players[0]] }).template
    expect(html).toContain('tour.nobodyAway')
  })

  it('disables the send button when no slot is free', () => {
    expect(page({ freeSlots: 0 }).template).toContain('disabled')
  })

  it('renders nothing before the data has loaded', () => {
    expect(new TourPage().template).toBe('<div></div>')
  })
})

describe('TourPage selectable players (#535)', () => {
  it('excludes injured, suspended and already travelling players', () => {
    const p = page()
    expect(p._isSelectable(p.data.players[0])).toBe(true)
    expect(p._isSelectable(p.data.players[1])).toBe(false)
    expect(p._isSelectable(p.data.players[2])).toBe(false)
    expect(p._isSelectable({ isInjured: false, isSuspended: true, tourDaysLeft: 0 })).toBe(false)
  })
})

describe('TourPage changing destination (#535)', () => {
  it('warns before discarding progress and switches when confirmed', async () => {
    const p = page()
    p.update = vi.fn()
    showConfirmDialog.mockResolvedValue(true)
    server.setMyTourMode.mockResolvedValue({ mode: 'europe', progress: 0 })

    await p._chooseDestination('europe')

    expect(showConfirmDialog).toHaveBeenCalled()
    expect(server.setMyTourMode).toHaveBeenCalledWith('europe')
    expect(p.update).toHaveBeenCalledWith(true)
  })

  it('keeps the destination when the warning is declined', async () => {
    const p = page()
    showConfirmDialog.mockResolvedValue(false)
    await p._chooseDestination('europe')
    expect(server.setMyTourMode).not.toHaveBeenCalled()
  })

  // Even at zero progress the travellers get redirected to another reward, so
  // the switch is never silent.
  it('still asks when there is no progress to lose', async () => {
    const p = page({ progress: 0 })
    p.update = vi.fn()
    showConfirmDialog.mockResolvedValue(true)
    server.setMyTourMode.mockResolvedValue({ mode: 'europe', progress: 0 })

    await p._chooseDestination('europe')

    expect(showConfirmDialog).toHaveBeenCalledWith(
      'tour.switchQuestion', 'tour.switchConfirm', 'common.cancel'
    )
    expect(server.setMyTourMode).toHaveBeenCalledWith('europe')
  })

  it('names the progress at stake when there is some', async () => {
    const p = page()
    p.update = vi.fn()
    showConfirmDialog.mockResolvedValue(true)
    server.setMyTourMode.mockResolvedValue({ mode: 'europe', progress: 0 })

    await p._chooseDestination('europe')

    expect(showConfirmDialog.mock.calls[0][0]).toBe('tour.switchWarning')
  })

  it('ignores a click on the destination that is already active', async () => {
    await page()._chooseDestination('asia')
    expect(showConfirmDialog).not.toHaveBeenCalled()
    expect(server.setMyTourMode).not.toHaveBeenCalled()
  })

  it('surfaces a server error', async () => {
    const p = page({ progress: 0 })
    p.update = vi.fn()
    showConfirmDialog.mockResolvedValue(true)
    server.setMyTourMode.mockRejectedValue(new Error('nope'))
    await p._chooseDestination('europe')
    expect(showServerError).toHaveBeenCalled()
  })
})

describe('TourPage recalling a player (#535)', () => {
  it('offers a call-back button only while the trip has not started', () => {
    const players = data().players
    const html = page({
      players: [
        ...players,
        { id: 4, name: 'Fresh', position: 'LM', level: 50, isInjured: false, isSuspended: false, tourDaysLeft: 5, canRecall: true, progressPerGameDay: 1 }
      ]
    }).template

    expect(html).toContain('data-player-id="4"')
    expect(html).not.toContain('data-player-id="2"')
  })

  it('calls the player back and refreshes', async () => {
    const p = page()
    p.update = vi.fn()
    server.recallPlayersFromTour.mockResolvedValue({ recalled: 1 })

    await p._recallPlayer(4)

    expect(server.recallPlayersFromTour).toHaveBeenCalledWith([4])
    expect(p.update).toHaveBeenCalledWith(true)
  })

  it('surfaces a server error', async () => {
    const p = page()
    p.update = vi.fn()
    server.recallPlayersFromTour.mockRejectedValue(new Error('The tour has already started'))
    await p._recallPlayer(4)
    expect(showServerError).toHaveBeenCalled()
  })
})
