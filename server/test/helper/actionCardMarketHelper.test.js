import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', async () => {
  const query = vi.fn()
  return {
    query,
    // Run the callback against the same mocked query so the existing
    // assertions keep working; a throwing callback rolls back by simply
    // propagating, which is what the real helper relies on.
    transaction: vi.fn(async (callback) => await callback(query))
  }
})
vi.mock('../../helper/financeHelper.js', () => ({
  updateTeamBalance: vi.fn()
}))
vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))
vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key),
  getUserLocale: vi.fn().mockResolvedValue('en')
}))
vi.mock('../../lib/websocket.js', () => ({
  sendToTeam: vi.fn()
}))
vi.mock('../../helper/teamHelper.js', () => ({
  getTeamById: vi.fn()
}))
vi.mock('../../helper/actionCardHelper.js', () => ({
  getActionCards: vi.fn().mockResolvedValue([])
}))

import { query } from '../../lib/database.js'
import { updateTeamBalance } from '../../helper/financeHelper.js'
import { getTeamById } from '../../helper/teamHelper.js'
import {
  createOffer, placeBid, acceptBid, getTradeHistory, reconcileCardMarket,
  calculateBotBidAmount, placeBotCardBids, BOT_CARD_BID_PRICES
} from '../../helper/actionCardMarketHelper.js'

const team = (over = {}) => ({ id: 1, name: 'My FC', user_id: 10, balance: 1000000, ...over })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createOffer', () => {
  it('escrows the card and inserts an offer with its bundled card', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('COUNT(*) AS openCount')) return [{ openCount: 0 }]
      if (sql.startsWith('UPDATE action_card SET')) return { affectedRows: 1 }
      if (sql.startsWith('SELECT id, action FROM action_card')) return [{ id: 55, action: 'FRESHNESS_10' }]
      if (sql.includes('INSERT INTO action_card_offer_card')) return { insertId: 1 }
      if (sql.includes('INSERT INTO action_card_offer')) return { insertId: 900 }
      return {}
    })

    const result = await createOffer([55], 'Wish: 200k', team(), 'en')

    expect(result).toEqual({ success: true, offerId: 900 })
    // Card was escrowed to state='offered'.
    expect(query).toHaveBeenCalledWith(
      "UPDATE action_card SET state='offered' WHERE id=? AND team_id=? AND played=0 AND state='received'",
      [55, 1]
    )
    // Card recorded in the offer's join table.
    expect(query).toHaveBeenCalledWith('INSERT INTO action_card_offer_card SET ?', expect.objectContaining({
      offer_id: 900, action_card_id: 55, action: 'FRESHNESS_10'
    }))
  })

  it('bundles multiple cards into a single offer', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('COUNT(*) AS openCount')) return [{ openCount: 0 }]
      if (sql.startsWith('UPDATE action_card SET')) return { affectedRows: 1 }
      if (sql.startsWith('SELECT id, action FROM action_card')) return [{ id: 55, action: 'FRESHNESS_10' }]
      if (sql.includes('INSERT INTO action_card_offer')) return { insertId: 900 }
      return {}
    })

    await createOffer([55, 66, 77], '', team(), 'en')

    // One join-table insert per bundled card.
    const joinInserts = query.mock.calls.filter(c => c[0] === 'INSERT INTO action_card_offer_card SET ?')
    expect(joinInserts).toHaveLength(3)
  })

  it('rejects an empty bundle', async () => {
    await expect(createOffer([], '', team(), 'en')).rejects.toThrow()
  })

  it('rejects when the open-offer limit is reached', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('COUNT(*) AS openCount')) return [{ openCount: 10 }]
      return {}
    })
    await expect(createOffer([55], '', team(), 'en')).rejects.toThrow()
  })
})

describe('placeBid', () => {
  it('rejects bidding on your own offer', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM action_card_offer')) return [{ id: 900, from_team_id: 1, status: 'open' }]
      return {}
    })
    await expect(placeBid(900, 1000, [], '', team(), 'en')).rejects.toThrow()
  })

  it('rejects an empty bid (no money, no cards)', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM action_card_offer')) return [{ id: 900, from_team_id: 2, status: 'open' }]
      return {}
    })
    await expect(placeBid(900, 0, [], '', team(), 'en')).rejects.toThrow()
  })

  it('rejects when the bidder cannot afford the money part', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM action_card_offer')) return [{ id: 900, from_team_id: 2, status: 'open' }]
      return {}
    })
    await expect(placeBid(900, 5000000, [], '', team({ balance: 1000 }), 'en')).rejects.toThrow()
  })

  it('inserts a money-only bid', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM action_card_offer')) return [{ id: 900, from_team_id: 2, status: 'open' }]
      if (sql.includes('INSERT INTO action_card_bid')) return { insertId: 700 }
      return {}
    })
    getTeamById.mockResolvedValue({ id: 2, name: 'Rival', user_id: null })

    const result = await placeBid(900, 50000, [], 'fair deal', team(), 'en')

    expect(result).toEqual({ success: true, bidId: 700 })
    expect(query).toHaveBeenCalledWith('INSERT INTO action_card_bid SET ?', expect.objectContaining({
      offer_id: 900, bidder_team_id: 1, money: 50000, comment: 'fair deal', status: 'open'
    }))
  })
})

describe('acceptBid', () => {
  it('moves the card to the bidder, the bid cards to the offerer, and the money', async () => {
    const offer = { id: 900, from_team_id: 1, status: 'open', action_card_id: 55 }
    const bid = { id: 700, offer_id: 900, bidder_team_id: 2, money: 40000, status: 'open' }
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM action_card_bid WHERE id=?')) return [bid]
      if (sql.includes('SELECT * FROM action_card_offer WHERE id=? AND from_team_id=?')) return [offer]
      if (sql.startsWith("UPDATE action_card_offer SET status='accepted'")) return { affectedRows: 1 }
      if (sql.startsWith("UPDATE action_card_bid SET status='accepted'")) return { affectedRows: 1 }
      if (sql.includes('action_card_offer_card')) return [{ action_card_id: 55, action: 'FRESHNESS_10' }]
      if (sql.includes('action_card_bid_card')) return [{ action_card_id: 88, action: 'BONUS_100K' }]
      if (sql.includes("status='open'") && sql.includes('SELECT * FROM action_card_bid WHERE offer_id')) return []
      return {}
    })
    getTeamById.mockResolvedValue({ id: 2, name: 'Rival', user_id: 20, balance: 500000 })

    const result = await acceptBid(700, team(), 5, 3, 'en')

    expect(result).toEqual({ success: true })
    // Listed card → bidder (team 2).
    expect(query).toHaveBeenCalledWith("UPDATE action_card SET team_id=?, state='received' WHERE id=?", [2, 55])
    // Bid card → offerer (team 1).
    expect(query).toHaveBeenCalledWith("UPDATE action_card SET team_id=?, state='received' WHERE id=?", [1, 88])
    // Money: offerer credited, bidder debited.
    expect(updateTeamBalance).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 40000, expect.any(String), 5, 3)
    expect(updateTeamBalance).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), -40000, expect.any(String), 5, 3)
  })

  it('rejects when the bidder can no longer afford the bid', async () => {
    const offer = { id: 900, from_team_id: 1, status: 'open', action_card_id: 55 }
    const bid = { id: 700, offer_id: 900, bidder_team_id: 2, money: 40000, status: 'open' }
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM action_card_bid WHERE id=?')) return [bid]
      if (sql.includes('SELECT * FROM action_card_offer WHERE id=? AND from_team_id=?')) return [offer]
      return {}
    })
    getTeamById.mockResolvedValue({ id: 2, name: 'Rival', user_id: 20, balance: 100 })

    await expect(acceptBid(700, team(), 5, 3, 'en')).rejects.toThrow()
    expect(updateTeamBalance).not.toHaveBeenCalled()
  })
})

describe('getTradeHistory', () => {
  it('normalizes settled offers and bids to the team perspective, newest first', async () => {
    query.mockImplementation(async (sql) => {
      // Trades where I was the offerer.
      if (sql.includes('FROM action_card_offer o') && sql.includes('o.from_team_id=?')) {
        return [{ offer_id: 900, settled_at: '2026-01-02 10:00:00', bid_id: 700, money: 40000, counterparty_name: 'Rival', counterparty_color: '#fff', counterparty_emblem: null }]
      }
      // Trades where I was the bidder.
      if (sql.includes('FROM action_card_bid b') && sql.includes('b.bidder_team_id=?')) {
        return [{ offer_id: 901, settled_at: '2026-01-01 10:00:00', bid_id: 701, money: 10000, counterparty_name: 'Other', counterparty_color: '#000', counterparty_emblem: null }]
      }
      if (sql.includes('FROM action_card_offer_card')) return [{ action_card_id: 1, action: 'BONUS_100K' }]
      if (sql.includes('FROM action_card_bid_card')) return [{ action_card_id: 2, action: 'SPY' }]
      return {}
    })

    const trades = await getTradeHistory(team())

    expect(trades).toHaveLength(2)
    // Newest first: the offerer trade (Jan 2) before the bidder trade (Jan 1).
    expect(trades[0].role).toBe('sold')
    expect(trades[0].money).toBe(40000) // received money
    expect(trades[1].role).toBe('bought')
    expect(trades[1].money).toBe(-10000) // paid money
  })
})

describe('calculateBotBidAmount (#505)', () => {
  it('uses the price list for a single card', () => {
    expect(calculateBotBidAmount([{ action: 'STAR_PLAYER' }], () => 0.5)).toBe(500000)
  })

  it('sums the prices of a bundled offer', () => {
    const amount = calculateBotBidAmount(
      [{ action: 'FRESHNESS_5' }, { action: 'SPY' }],
      () => 0.5
    )
    expect(amount).toBe(25000)
  })

  it('stays within the ±10% threshold', () => {
    const base = BOT_CARD_BID_PRICES.LEVEL_UP_PLAYER_40
    expect(calculateBotBidAmount([{ action: 'LEVEL_UP_PLAYER_40' }], () => 0)).toBe(base * 0.9)
    expect(calculateBotBidAmount([{ action: 'LEVEL_UP_PLAYER_40' }], () => 1)).toBe(base * 1.1)
  })

  it('returns 0 for an unknown card so the offer is skipped', () => {
    expect(calculateBotBidAmount([{ action: 'SOMETHING_NEW' }], () => 0.5)).toBe(0)
    expect(calculateBotBidAmount([{ action: 'SPY' }, { action: 'SOMETHING_NEW' }], () => 0.5)).toBe(0)
  })

  it('returns 0 for an empty bundle', () => {
    expect(calculateBotBidAmount([], () => 0.5)).toBe(0)
  })

  it('prices every card type the ticket lists', () => {
    for (const action of [
      'NEW_YOUTH_PLAYER_1', 'NEW_YOUTH_PLAYER_2', 'NEW_YOUTH_PLAYER_3', 'STAR_PLAYER',
      'MOTIVATING_SPEECH', 'LEVEL_UP_PLAYER_40', 'LEVEL_UP_PLAYER_70', 'LEVEL_UP_PLAYER_100',
      'FRESHNESS_5', 'FRESHNESS_10', 'FRESHNESS_20', 'SPY'
    ]) {
      expect(BOT_CARD_BID_PRICES[action]).toBeGreaterThan(0)
    }
  })
})

describe('placeBotCardBids (#505)', () => {
  const botTeam = { id: 99, name: 'Bot FC', user_id: null, balance: 5000000 }

  it('bids on an offer older than 24h and notifies the offerer', async () => {
    getTeamById.mockResolvedValue({ id: 1, name: 'My FC', user_id: 10 })
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM team WHERE user_id IS NULL')) return [botTeam]
      if (sql.includes('FROM action_card_offer o') && sql.includes('INTERVAL ? HOUR')) {
        return [{ id: 900, from_team_id: 1, created_at: '2026-08-01 10:00:00' }]
      }
      if (sql.includes('DATE(b.created_at) = CURDATE()')) return []
      if (sql.includes('FROM action_card_offer_card')) return [{ action_card_id: 55, action: 'SPY' }]
      if (sql.includes("SELECT * FROM action_card_offer WHERE id=? AND status='open'")) {
        return [{ id: 900, from_team_id: 1, status: 'open' }]
      }
      if (sql.includes('INSERT INTO action_card_bid_card')) return { insertId: 1 }
      if (sql.includes('INSERT INTO action_card_bid')) return { insertId: 700 }
      return []
    })

    const result = await placeBotCardBids()

    expect(result.bids).toBe(1)
    const bidInsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO action_card_bid '))
    expect(bidInsert[1].bidder_team_id).toBe(99)
    expect(bidInsert[1].money).toBeGreaterThanOrEqual(18000)
    expect(bidInsert[1].money).toBeLessThanOrEqual(22000)
  })

  it('skips a manager who already received a bot bid today', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM team WHERE user_id IS NULL')) return [botTeam]
      if (sql.includes('FROM action_card_offer o') && sql.includes('INTERVAL ? HOUR')) {
        return [{ id: 900, from_team_id: 1, created_at: '2026-08-01 10:00:00' }]
      }
      if (sql.includes('DATE(b.created_at) = CURDATE()')) return [{ team_id: 1 }]
      return []
    })

    const result = await placeBotCardBids()

    expect(result.bids).toBe(0)
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO action_card_bid'))).toBe(false)
  })

  it('places at most one bid per manager even with several aged offers', async () => {
    getTeamById.mockResolvedValue({ id: 1, name: 'My FC', user_id: 10 })
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM team WHERE user_id IS NULL')) return [botTeam]
      if (sql.includes('FROM action_card_offer o') && sql.includes('INTERVAL ? HOUR')) {
        return [
          { id: 900, from_team_id: 1, created_at: '2026-08-01 10:00:00' },
          { id: 901, from_team_id: 1, created_at: '2026-08-01 11:00:00' }
        ]
      }
      if (sql.includes('DATE(b.created_at) = CURDATE()')) return []
      if (sql.includes('FROM action_card_offer_card')) return [{ action_card_id: 55, action: 'SPY' }]
      if (sql.includes("SELECT * FROM action_card_offer WHERE id=? AND status='open'")) {
        return [{ id: 900, from_team_id: 1, status: 'open' }]
      }
      if (sql.includes('INSERT INTO action_card_bid_card')) return { insertId: 1 }
      if (sql.includes('INSERT INTO action_card_bid')) return { insertId: 700 }
      return []
    })

    const result = await placeBotCardBids()

    expect(result.bids).toBe(1)
  })

  it('does not bid when no bot team can afford the bundle', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM team WHERE user_id IS NULL')) return [{ ...botTeam, balance: 100 }]
      if (sql.includes('FROM action_card_offer o') && sql.includes('INTERVAL ? HOUR')) {
        return [{ id: 900, from_team_id: 1, created_at: '2026-08-01 10:00:00' }]
      }
      if (sql.includes('DATE(b.created_at) = CURDATE()')) return []
      if (sql.includes('FROM action_card_offer_card')) return [{ action_card_id: 55, action: 'STAR_PLAYER' }]
      return []
    })

    const result = await placeBotCardBids()

    expect(result.bids).toBe(0)
  })

  it('does nothing when there are no bot teams', async () => {
    query.mockResolvedValue([])
    const result = await placeBotCardBids()
    expect(result.bids).toBe(0)
  })
})

describe('million bonus card on the marketplace (#537)', () => {
  it('has a bot bid price just under its face value', () => {
    expect(BOT_CARD_BID_PRICES.MILLION_BONUS).toBe(900000)
    // Bidding the full 1M would make listing the card a risk-free profit.
    expect(BOT_CARD_BID_PRICES.MILLION_BONUS).toBeLessThan(1_000_000)
  })

  it('is priced ten times the cash bonus, like its payout', () => {
    expect(BOT_CARD_BID_PRICES.MILLION_BONUS).toBe(BOT_CARD_BID_PRICES.BONUS_100K * 10)
  })

  it('is valued like any other card in a bundle', () => {
    const amount = calculateBotBidAmount(
      [{ action: 'MILLION_BONUS' }, { action: 'SPY' }],
      () => 0.5
    )
    expect(amount).toBe(920000)
  })
})

describe('reconcileCardMarket', () => {
  /**
   * Wire up a query mock for the reconcile pass.
   * @param {{brokenOffers?: Array, brokenBids?: Array, orphans?: Array}} state
   * @returns {void}
   */
  function mockReconcile (state = {}) {
    query.mockImplementation(async (sql) => {
      const q = String(sql)
      if (q.includes('FROM action_card_offer o') && q.includes('LEFT JOIN action_card c')) {
        return state.brokenOffers ?? []
      }
      if (q.includes('FROM action_card_bid b') && q.includes('LEFT JOIN action_card c')) {
        return state.brokenBids ?? []
      }
      if (q.includes('NOT EXISTS')) return state.orphans ?? []
      if (q.startsWith('UPDATE action_card_offer SET') || q.startsWith('UPDATE action_card_bid SET')) {
        return { affectedRows: 1 }
      }
      if (q.includes("SELECT * FROM action_card_bid WHERE offer_id")) return []
      return []
    })
  }

  it('cancels an offer whose listed card no longer exists and releases the rest', async () => {
    mockReconcile({ brokenOffers: [{ id: 900, from_team_id: 1 }] })
    getTeamById.mockResolvedValue({ id: 1, name: 'My FC', user_id: 10 })

    const result = await reconcileCardMarket(1)

    expect(result.cancelledOffers).toBe(1)
    expect(query).toHaveBeenCalledWith(
      "UPDATE action_card_offer SET status='cancelled' WHERE id=? AND status='open'",
      [900]
    )
  })

  it('cancels a bid whose staked card is gone', async () => {
    mockReconcile({ brokenBids: [{ id: 700, bidder_team_id: 2, offer_id: 900 }] })
    getTeamById.mockResolvedValue({ id: 2, name: 'Rival', user_id: 20 })

    const result = await reconcileCardMarket(2)

    expect(result.cancelledBids).toBe(1)
    expect(query).toHaveBeenCalledWith(
      "UPDATE action_card_bid SET status='cancelled' WHERE id=? AND status='open'",
      [700]
    )
  })

  it('leaves a healthy marketplace untouched', async () => {
    mockReconcile()

    const result = await reconcileCardMarket(1)

    expect(result).toEqual({ cancelledOffers: 0, cancelledBids: 0, releasedCards: 0 })
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status='cancelled'"))).toBe(false)
  })

  it('hands orphaned escrow back to the owner', async () => {
    mockReconcile({ orphans: [{ id: 55 }, { id: 66 }] })

    const result = await reconcileCardMarket(1)

    expect(result.releasedCards).toBe(2)
    expect(query).toHaveBeenCalledWith(
      "UPDATE action_card SET state='received' WHERE id IN (?) AND team_id=? AND state='offered'",
      [[55, 66], 1]
    )
  })

  it('skips the orphan sweep when called without a team', async () => {
    mockReconcile({ orphans: [{ id: 55 }] })

    const result = await reconcileCardMarket()

    expect(result.releasedCards).toBe(0)
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET state='received' WHERE id IN"))).toBe(false)
  })
})
