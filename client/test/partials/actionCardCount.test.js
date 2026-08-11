import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: { getActionCards: vi.fn() }
}))

import { ActionCardCount } from '../../partials/actionCardCount.js'
import { server } from '../../lib/gateway.js'

beforeEach(() => {
  vi.clearAllMocks()
  server.getActionCards.mockResolvedValue({ actionCards: [] })
})

describe('ActionCardCount (#523)', () => {
  it('counts the playable cards in the inventory', async () => {
    server.getActionCards.mockResolvedValue({ actionCards: [{ id: 1 }, { id: 2 }, { id: 3 }] })
    const item = new ActionCardCount()
    await item.load()
    expect(item.count).toBe(3)
    expect(item.template).toContain('3')
  })

  it('shows zero rather than nothing when the inventory is empty', async () => {
    const item = new ActionCardCount()
    await item.load()
    expect(item.count).toBe(0)
    expect(item.template).toContain('0')
  })

  it('falls back to zero when the request fails', async () => {
    server.getActionCards.mockRejectedValue(new Error('offline'))
    const item = new ActionCardCount()
    await item.load()
    expect(item.count).toBe(0)
  })

  it('refetches on ACTION_CARDS_CHANGED and on reconnect', async () => {
    const item = new ActionCardCount()
    await item.load()
    item.update = vi.fn()

    item.serverEvents.ACTION_CARDS_CHANGED()
    item.serverEvents.RECONNECTED()

    expect(item.update).toHaveBeenCalledTimes(2)
    // `true` re-runs load(), otherwise the count would redraw its stale value.
    expect(item.update).toHaveBeenCalledWith(true)
  })
})
