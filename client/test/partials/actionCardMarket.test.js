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

describe('ActionCardMarket all-offers tab', () => {
  function countOfferRows (html) {
    return (html.match(/card-market-offer/g) ?? []).length
  }

  function makeOffers (n, action = 'SPY') {
    return Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      cards: [{ action }],
      team_name: 'FC ' + i
    }))
  }

  it('shows at most 6 offers and notes how many are hidden', () => {
    const market = makeMarket([])
    market._offers = makeOffers(10)
    const html = market._renderOffers()
    expect(countOfferRows(html)).toBe(6)
    expect(html).toContain('Showing 6 of 10 offers')
  })

  it('does not show the count hint when 6 or fewer offers match', () => {
    const market = makeMarket([])
    market._offers = makeOffers(4)
    const html = market._renderOffers()
    expect(countOfferRows(html)).toBe(4)
    expect(html).not.toContain('Showing')
  })

  it('renders a card-type filter select with one option per distinct type', () => {
    const market = makeMarket([])
    market._offers = [
      { id: 1, cards: [{ action: 'SPY' }], team_name: 'A' },
      { id: 2, cards: [{ action: 'FRESHNESS_5' }], team_name: 'B' },
      { id: 3, cards: [{ action: 'SPY' }], team_name: 'C' }
    ]
    const html = market._renderOffers()
    expect(html).toContain(`id="${market._offerFilterId}"`)
    expect(html).toContain('All card types')
    // Two distinct types + the "all" option.
    expect((html.match(/<option/g) ?? []).length).toBe(3)
  })

  it('filters offers by the selected card type', () => {
    const market = makeMarket([])
    market._offers = [
      { id: 1, cards: [{ action: 'SPY' }], team_name: 'A' },
      { id: 2, cards: [{ action: 'FRESHNESS_5' }], team_name: 'B' },
      { id: 3, cards: [{ action: 'SPY' }], team_name: 'C' }
    ]
    market._offerTypeFilter = 'SPY'
    const html = market._renderOffers()
    expect(countOfferRows(html)).toBe(2)
  })

  it('shows the empty state (but keeps the filter) when no offer matches', () => {
    const market = makeMarket([])
    market._offers = makeOffers(3, 'SPY')
    market._offerTypeFilter = 'FRESHNESS_5'
    const html = market._renderOffers()
    expect(countOfferRows(html)).toBe(0)
    expect(html).toContain(`id="${market._offerFilterId}"`)
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
