import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: { getMyBalance: vi.fn() }
}))
vi.mock('../../i18n/index.js', () => ({
  t: (key) => key,
  getLocale: () => 'de'
}))

import { Balance } from '../../partials/balance.js'
import { server } from '../../lib/gateway.js'

beforeEach(() => {
  vi.clearAllMocks()
  server.getMyBalance.mockResolvedValue({ balance: 2_819_192 })
})

describe('Balance', () => {
  it('renders the exact amount by default', async () => {
    const balance = new Balance()
    await balance.load()
    expect(balance.template).toContain('2.819.192')
    expect(balance.template).not.toContain('2,8m')
  })

  it('#523 abbreviates the amount in short mode', async () => {
    const balance = new Balance({ short: true })
    await balance.load()
    expect(balance.template).toContain('2.8M €')
  })

  it('#523 keeps the exact amount in the title attribute', async () => {
    const balance = new Balance({ short: true })
    await balance.load()
    expect(balance.template).toContain('title="2.819.192')
  })

  it('falls back to zero when the request fails', async () => {
    server.getMyBalance.mockRejectedValue(new Error('offline'))
    const balance = new Balance({ short: true })
    await balance.load()
    expect(balance.balance).toBe(0)
  })
})
