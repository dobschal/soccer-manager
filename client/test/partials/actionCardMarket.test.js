import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the content string passed to the overlay so we can assert on the
// bid-overlay markup without a real DOM overlay.
let lastOverlayContent = null
vi.mock('../../partials/overlay.js', () => ({
  showOverlay: vi.fn((_title, _subtitle, content) => {
    lastOverlayContent = content
    return { remove: vi.fn() }
  })
}))

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getActionCardMarket: vi.fn(() => Promise.resolve({ offers: [], myOffers: [], myBids: [], myCards: [] })),
    getActionCardTradeHistory: vi.fn(() => Promise.resolve({ trades: [] }))
  }
}))

vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))

vi.mock('../../lib/actionCardSvg.js', () => ({
  preloadAllActionCardSvgs: vi.fn(() => Promise.resolve()),
  renderActionCardSvg: vi.fn(() => '<svg></svg>')
}))

vi.mock('../../partials/currencyInput.js', () => ({
  renderCurrencyInput: vi.fn(() => '<div class="currency-input"></div>'),
  setupCurrencyInput: vi.fn()
}))

const { ActionCardMarket } = await import('../../partials/actionCardMarket.js')

const offer = { id: 1, cards: [{ action: 'SPY' }], team_name: 'FC Test' }

function makeMarket (myCards) {
  const market = new ActionCardMarket()
  market._myCards = myCards
  return market
}

function countChips (html) {
  return (html.match(/data-card-id=/g) ?? []).length
}

describe('ActionCardMarket bid overlay', () => {
  beforeEach(() => {
    lastOverlayContent = null
  })

  it('shows only one card per type by default, with a "show all" button', () => {
    const market = makeMarket([
      { id: 1, action: 'FRESHNESS_5' },
      { id: 2, action: 'FRESHNESS_5' },
      { id: 3, action: 'FRESHNESS_5' },
      { id: 4, action: 'BONUS_100K' }
    ])
    market._showBidOverlay(offer)
    // Two distinct types → two chips shown initially.
    expect(countChips(lastOverlayContent)).toBe(2)
    expect(lastOverlayContent).toContain('Show all cards')
  })

  it('does not show a "show all" button when each owned card is a distinct type', () => {
    const market = makeMarket([
      { id: 1, action: 'FRESHNESS_5' },
      { id: 2, action: 'BONUS_100K' }
    ])
    market._showBidOverlay(offer)
    expect(countChips(lastOverlayContent)).toBe(2)
    expect(lastOverlayContent).not.toContain('Show all cards')
  })

  it('shows no chips and no "show all" button when the team owns no cards', () => {
    const market = makeMarket([])
    market._showBidOverlay(offer)
    expect(countChips(lastOverlayContent)).toBe(0)
    expect(lastOverlayContent).not.toContain('Show all cards')
  })
})

describe('ActionCardMarket trades tab', () => {
  const trade = {
    role: 'bought',
    money: -50000,
    counterparty: { name: 'FC Test', color: '#fff', emblem: null },
    gaveCards: [{ action: 'SPY' }],
    gotCards: [{ action: 'FRESHNESS_5' }]
  }

  it('renders the "My trades" tab pill', () => {
    const market = makeMarket([])
    market._trades = [trade]
    expect(market.template).toContain('data-market-tab="trades"')
  })

  it('renders an empty-state message when there are no trades', () => {
    const market = makeMarket([])
    market._trades = []
    expect(market._renderTrades()).toContain('trades')
    expect(market._renderTrades()).not.toContain('card-market-trade')
  })

  it('renders one trade row per completed trade', () => {
    const market = makeMarket([])
    market._trades = [trade, trade]
    const html = market._renderTrades()
    expect((html.match(/card-market-trade-cards/g) ?? []).length).toBe(2)
  })
})
