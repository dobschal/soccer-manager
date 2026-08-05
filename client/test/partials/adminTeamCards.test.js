import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    adminGetTeamActionCards: vi.fn(),
    adminAddActionCard: vi.fn(),
    adminRemoveActionCard: vi.fn()
  }
}))

vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

vi.mock('../../lib/actionCardLabels.js', () => ({
  actionCardLabel: vi.fn((action) => `label:${action}`)
}))

import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { AdminTeamCards } from '../../partials/adminTeamCards.js'

/**
 * @param {Object} [state]
 * @returns {AdminTeamCards}
 */
function makePanel (state = {}) {
  const panel = new AdminTeamCards({ teamId: 7 })
  panel.cards = state.cards ?? []
  panel.types = state.types ?? ['BONUS_100K', 'SPY']
  // Skip the DOM round-trip: update() is a no-op for an unrendered element,
  // so the tests can drive the handlers directly.
  panel.update = vi.fn(async (reload) => {
    if (reload) await panel.load()
  })
  return panel
}

describe('AdminTeamCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('loads the team\'s cards and the manageable types', async () => {
    server.adminGetTeamActionCards.mockResolvedValue({
      actionCards: [{ action: 'SPY', state: 'received', count: 2 }],
      types: ['SPY']
    })
    const panel = new AdminTeamCards({ teamId: 7 })

    await panel.load()

    expect(server.adminGetTeamActionCards).toHaveBeenCalledWith(7)
    expect(panel.cards).toEqual([{ action: 'SPY', state: 'received', count: 2 }])
    expect(panel.types).toEqual(['SPY'])
  })

  it('renders one row per card stack with a remove button', () => {
    const panel = makePanel({
      cards: [
        { action: 'BONUS_100K', state: 'received', count: 3 },
        { action: 'SPY', state: 'pending', count: 1 }
      ]
    })

    const html = panel.template

    expect(html).toContain('label:BONUS_100K')
    expect(html).toContain('3&times;')
    expect(html).toContain('data-action="BONUS_100K" data-state="received"')
    expect(html).toContain('data-action="SPY" data-state="pending"')
    // Unclaimed (pending) gifts are marked so they aren't confused with held cards
    expect(html).toContain('team.adminCardPending')
  })

  it('renders an empty hint and the add dropdown when the team has no cards', () => {
    const panel = makePanel()

    const html = panel.template

    expect(html).toContain('team.adminNoActionCards')
    expect(html).toContain('<option value="BONUS_100K">label:BONUS_100K</option>')
    expect(html).toContain('<option value="SPY">label:SPY</option>')
  })

  it('adds the selected card type and refreshes', async () => {
    const panel = makePanel()
    server.adminAddActionCard.mockResolvedValue({ success: true })
    server.adminGetTeamActionCards.mockResolvedValue({ actionCards: [], types: [] })
    const select = document.createElement('select')
    select.className = 'admin-card-select'
    select.innerHTML = '<option value="SPY">SPY</option>'
    document.body.append(select)
    vi.spyOn(document, 'querySelector').mockReturnValue(select)

    await panel._addCard()

    expect(server.adminAddActionCard).toHaveBeenCalledWith(7, 'SPY')
    expect(toast).toHaveBeenCalledWith('team.adminCardAdded', 'success')
    expect(panel.update).toHaveBeenLastCalledWith(true)
  })

  it('removes one card of the given type and state', async () => {
    const panel = makePanel({ cards: [{ action: 'SPY', state: 'pending', count: 1 }] })
    server.adminRemoveActionCard.mockResolvedValue({ success: true })
    server.adminGetTeamActionCards.mockResolvedValue({ actionCards: [], types: [] })

    await panel._removeCard('SPY', 'pending')

    expect(server.adminRemoveActionCard).toHaveBeenCalledWith(7, 'SPY', 'pending')
    expect(toast).toHaveBeenCalledWith('team.adminCardRemoved', 'success')
  })

  it('surfaces server errors as a toast and still refreshes', async () => {
    const panel = makePanel({ cards: [{ action: 'SPY', state: 'received', count: 1 }] })
    server.adminRemoveActionCard.mockRejectedValue({ message: 'nope' })
    server.adminGetTeamActionCards.mockResolvedValue({ actionCards: [], types: [] })

    await panel._removeCard('SPY', 'received')

    expect(toast).toHaveBeenCalledWith('nope', 'error')
    expect(panel._busy).toBe(false)
    expect(panel.update).toHaveBeenLastCalledWith(true)
  })
})
