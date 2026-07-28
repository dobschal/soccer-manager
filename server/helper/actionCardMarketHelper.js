import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { updateTeamBalance } from './financeHelper.js'
import { addLogMessage } from './logMessageHelper.js'
import { getUserLocale, t } from '../i18n/index.js'
import { sendToTeam } from '../lib/websocket.js'
import { SERVER_EVENTS } from '../../client/lib/serverEvents.js'
import { getTeamById } from './teamHelper.js'
import { getActionCards } from './actionCardHelper.js'

/** Maximum number of open marketplace offers a single team may have at once. */
export const MAX_OPEN_CARD_OFFERS = 10

/**
 * Notify a team's user that the marketplace state relevant to them changed.
 * @param {number} teamId
 */
function notifyMarket (teamId) {
  try {
    sendToTeam(teamId, SERVER_EVENTS.ACTION_CARD_MARKET_CHANGED.name)
  } catch { /* offline / bot team — ignore */ }
}

/**
 * Notify a team's user that their action-card inventory changed.
 * @param {number} teamId
 */
function notifyInventory (teamId) {
  try {
    sendToTeam(teamId, SERVER_EVENTS.ACTION_CARDS_CHANGED.name)
  } catch { /* ignore */ }
}

/**
 * Fetch the card ids escrowed inside a bid.
 * @param {number} bidId
 * @returns {Promise<Array<{action_card_id: number, action: string}>>}
 */
async function getBidCards (bidId) {
  return await query('SELECT action_card_id, action FROM action_card_bid_card WHERE bid_id=?', [bidId])
}

/**
 * Release (un-escrow) a bid's cards back to the bidder's inventory.
 * @param {number} bidId
 * @param {number} bidderTeamId
 */
async function releaseBidCards (bidId, bidderTeamId) {
  const cards = await getBidCards(bidId)
  for (const c of cards) {
    await query(
      "UPDATE action_card SET state='received' WHERE id=? AND team_id=? AND state='offered'",
      [c.action_card_id, bidderTeamId]
    )
  }
}

/**
 * Create a marketplace offer for one of the team's received cards. The card is
 * escrowed (state='offered') so it can't also be used while listed.
 * @param {number} actionCardId
 * @param {string} comment
 * @param {TeamType} team
 * @param {string} locale
 * @returns {Promise<{success: boolean, offerId: number}>}
 */
export async function createOffer (actionCardId, comment, team, locale) {
  const [{ openCount }] = await query(
    "SELECT COUNT(*) AS openCount FROM action_card_offer WHERE from_team_id=? AND status='open'",
    [team.id]
  )
  if (openCount >= MAX_OPEN_CARD_OFFERS) {
    throw new BadRequestError(t('error.tooManyCardOffers', { max: MAX_OPEN_CARD_OFFERS }, locale))
  }

  const [card] = await query(
    "SELECT * FROM action_card WHERE id=? AND team_id=? AND played=0 AND state='received'",
    [actionCardId, team.id]
  )
  if (!card) throw new BadRequestError(t('error.cardNotFound', {}, locale))

  // Atomically escrow the card so two concurrent listings can't grab it.
  const claim = await query(
    "UPDATE action_card SET state='offered' WHERE id=? AND team_id=? AND played=0 AND state='received'",
    [actionCardId, team.id]
  )
  if (claim.affectedRows === 0) throw new BadRequestError(t('error.cardNotFound', {}, locale))

  const safeComment = typeof comment === 'string' ? comment.slice(0, 255) : null
  const result = await query('INSERT INTO action_card_offer SET ?', {
    action_card_id: actionCardId,
    action: card.action,
    from_team_id: team.id,
    comment: safeComment,
    status: 'open'
  })
  return { success: true, offerId: result.insertId }
}

/**
 * Cancel one of the team's own open offers: un-escrow the listed card and
 * reject every open bid (releasing the bidders' escrowed cards).
 * @param {number} offerId
 * @param {TeamType} team
 * @param {string} locale
 * @returns {Promise<{success: boolean}>}
 */
export async function cancelOffer (offerId, team, locale) {
  const [offer] = await query(
    "SELECT * FROM action_card_offer WHERE id=? AND from_team_id=? AND status='open'",
    [offerId, team.id]
  )
  if (!offer) throw new BadRequestError(t('error.offerNotFound', {}, locale))

  const claim = await query(
    "UPDATE action_card_offer SET status='cancelled' WHERE id=? AND from_team_id=? AND status='open'",
    [offerId, team.id]
  )
  if (claim.affectedRows === 0) throw new BadRequestError(t('error.offerNotFound', {}, locale))

  await query(
    "UPDATE action_card SET state='received' WHERE id=? AND team_id=? AND state='offered'",
    [offer.action_card_id, team.id]
  )
  await _rejectAllOpenBids(offerId)
  return { success: true }
}

/**
 * Reject every still-open bid on an offer and release their escrowed cards.
 * @param {number} offerId
 */
async function _rejectAllOpenBids (offerId) {
  const bids = await query("SELECT * FROM action_card_bid WHERE offer_id=? AND status='open'", [offerId])
  for (const bid of bids) {
    await query("UPDATE action_card_bid SET status='rejected' WHERE id=?", [bid.id])
    await releaseBidCards(bid.id, bid.bidder_team_id)
    notifyMarket(bid.bidder_team_id)
    notifyInventory(bid.bidder_team_id)
  }
}

/**
 * Place a bid (money and/or cards) on someone else's offer. Any offered cards
 * are escrowed; the money is only validated now and moved on accept.
 * @param {number} offerId
 * @param {number} money
 * @param {number[]} cardIds
 * @param {TeamType} team
 * @param {string} locale
 * @returns {Promise<{success: boolean, bidId: number}>}
 */
export async function placeBid (offerId, money, cardIds, team, locale) {
  const [offer] = await query("SELECT * FROM action_card_offer WHERE id=? AND status='open'", [offerId])
  if (!offer) throw new BadRequestError(t('error.offerNotFound', {}, locale))
  if (offer.from_team_id === team.id) throw new BadRequestError(t('error.cannotBidOwnOffer', {}, locale))

  const safeMoney = Math.max(0, Math.floor(Number(money) || 0))
  const ids = Array.isArray(cardIds) ? cardIds.map(Number).filter(Boolean) : []
  if (safeMoney === 0 && ids.length === 0) {
    throw new BadRequestError(t('error.emptyBid', {}, locale))
  }
  if (safeMoney > team.balance) {
    throw new BadRequestError(t('error.notEnoughMoney', {}, locale))
  }

  // Verify every offered card is currently available, then escrow them.
  const cards = []
  for (const id of ids) {
    const [card] = await query(
      "SELECT * FROM action_card WHERE id=? AND team_id=? AND played=0 AND state='received'",
      [id, team.id]
    )
    if (!card) {
      // Roll back any escrow already done in this loop.
      for (const done of cards) {
        await query("UPDATE action_card SET state='received' WHERE id=? AND team_id=?", [done.id, team.id])
      }
      throw new BadRequestError(t('error.cardNotFound', {}, locale))
    }
    await query("UPDATE action_card SET state='offered' WHERE id=? AND team_id=?", [id, team.id])
    cards.push(card)
  }

  const result = await query('INSERT INTO action_card_bid SET ?', {
    offer_id: offerId,
    bidder_team_id: team.id,
    money: safeMoney,
    status: 'open'
  })
  const bidId = result.insertId
  for (const card of cards) {
    await query('INSERT INTO action_card_bid_card SET ?', {
      bid_id: bidId,
      action_card_id: card.id,
      action: card.action
    })
  }

  // Notify the offerer of the incoming bid.
  const offererTeam = await getTeamById(offer.from_team_id)
  if (offererTeam?.user_id) {
    const offererLocale = await getUserLocale(offererTeam.user_id)
    await addLogMessage(
      t('log.cardBidReceived', { team: team.name }, offererLocale),
      offererTeam, 'OPEN_CARD_MARKET', null, 'gavel', SERVER_EVENTS.ACTION_CARD_MARKET_CHANGED.name, 'info'
    )
  }
  return { success: true, bidId }
}

/**
 * Accept a bid on one of the team's offers. Atomically settles the trade:
 * moves the listed card to the bidder, the bid's cards to the offerer, and the
 * money from bidder to offerer. Competing bids are rejected.
 * @param {number} bidId
 * @param {TeamType} team - the offerer's team
 * @param {number} gameDay
 * @param {number} season
 * @param {string} locale
 * @returns {Promise<{success: boolean}>}
 */
export async function acceptBid (bidId, team, gameDay, season, locale) {
  const [bid] = await query("SELECT * FROM action_card_bid WHERE id=? AND status='open'", [bidId])
  if (!bid) throw new BadRequestError(t('error.offerNotFound', {}, locale))
  const [offer] = await query(
    "SELECT * FROM action_card_offer WHERE id=? AND from_team_id=? AND status='open'",
    [bid.offer_id, team.id]
  )
  if (!offer) throw new BadRequestError(t('error.offerNotFound', {}, locale))

  const bidderTeam = await getTeamById(bid.bidder_team_id)
  if (!bidderTeam) throw new BadRequestError(t('error.offerNotFound', {}, locale))
  if (bid.money > bidderTeam.balance) {
    throw new BadRequestError(t('error.bidderCannotAfford', {}, locale))
  }

  // Atomically claim both offer and bid so concurrent accepts can't double-settle.
  const offerClaim = await query(
    "UPDATE action_card_offer SET status='accepted' WHERE id=? AND from_team_id=? AND status='open'",
    [offer.id, team.id]
  )
  if (offerClaim.affectedRows === 0) throw new BadRequestError(t('error.offerNotFound', {}, locale))
  const bidClaim = await query("UPDATE action_card_bid SET status='accepted' WHERE id=? AND status='open'", [bidId])
  if (bidClaim.affectedRows === 0) {
    await query("UPDATE action_card_offer SET status='open' WHERE id=?", [offer.id])
    throw new BadRequestError(t('error.offerNotFound', {}, locale))
  }

  // Move the listed card to the bidder.
  await query("UPDATE action_card SET team_id=?, state='received' WHERE id=?", [bid.bidder_team_id, offer.action_card_id])
  // Move the bid's cards to the offerer.
  const bidCards = await getBidCards(bidId)
  for (const c of bidCards) {
    await query("UPDATE action_card SET team_id=?, state='received' WHERE id=?", [team.id, c.action_card_id])
  }

  // Move the money (offerer receives, bidder pays).
  if (bid.money > 0) {
    const offererLocale = team.user_id ? await getUserLocale(team.user_id) : 'en'
    const bidderLocale = bidderTeam.user_id ? await getUserLocale(bidderTeam.user_id) : 'en'
    await updateTeamBalance(team, bid.money, t('finance.cardSold', {}, offererLocale), gameDay, season)
    await updateTeamBalance(bidderTeam, bid.money * -1, t('finance.cardBought', {}, bidderLocale), gameDay, season)
  }

  // Reject the remaining bids on this offer.
  await _rejectAllOpenBids(offer.id)

  // Log + notify both sides.
  const offererLocale = team.user_id ? await getUserLocale(team.user_id) : 'en'
  const bidderLocale = bidderTeam.user_id ? await getUserLocale(bidderTeam.user_id) : 'en'
  await addLogMessage(t('log.cardTradeSold', { team: bidderTeam.name }, offererLocale), team, 'OPEN_CARD_MARKET', null, 'exchange', SERVER_EVENTS.ACTION_CARD_MARKET_CHANGED.name, 'success')
  await addLogMessage(t('log.cardTradeBought', { team: team.name }, bidderLocale), bidderTeam, 'OPEN_CARD_MARKET', null, 'exchange', SERVER_EVENTS.ACTION_CARD_MARKET_CHANGED.name, 'success')
  notifyInventory(team.id)
  notifyInventory(bid.bidder_team_id)
  return { success: true }
}

/**
 * Reject a bid on one of the team's offers, releasing the bidder's cards.
 * @param {number} bidId
 * @param {TeamType} team - offerer's team
 * @param {string} locale
 * @returns {Promise<{success: boolean}>}
 */
export async function rejectBid (bidId, team, locale) {
  const [bid] = await query("SELECT * FROM action_card_bid WHERE id=? AND status='open'", [bidId])
  if (!bid) throw new BadRequestError(t('error.offerNotFound', {}, locale))
  const [offer] = await query(
    "SELECT * FROM action_card_offer WHERE id=? AND from_team_id=? AND status='open'",
    [bid.offer_id, team.id]
  )
  if (!offer) throw new BadRequestError(t('error.offerNotFound', {}, locale))

  const claim = await query("UPDATE action_card_bid SET status='rejected' WHERE id=? AND status='open'", [bidId])
  if (claim.affectedRows === 0) throw new BadRequestError(t('error.offerNotFound', {}, locale))
  await releaseBidCards(bidId, bid.bidder_team_id)
  notifyMarket(bid.bidder_team_id)
  notifyInventory(bid.bidder_team_id)
  return { success: true }
}

/**
 * Withdraw one of the team's own open bids, releasing its escrowed cards.
 * @param {number} bidId
 * @param {TeamType} team - bidder's team
 * @param {string} locale
 * @returns {Promise<{success: boolean}>}
 */
export async function cancelBid (bidId, team, locale) {
  const [bid] = await query(
    "SELECT * FROM action_card_bid WHERE id=? AND bidder_team_id=? AND status='open'",
    [bidId, team.id]
  )
  if (!bid) throw new BadRequestError(t('error.offerNotFound', {}, locale))

  const claim = await query("UPDATE action_card_bid SET status='cancelled' WHERE id=? AND status='open'", [bidId])
  if (claim.affectedRows === 0) throw new BadRequestError(t('error.offerNotFound', {}, locale))
  await releaseBidCards(bidId, team.id)
  notifyMarket(bid.offer_id)
  return { success: true }
}

/**
 * Load everything the marketplace UI needs for a team in one call.
 * @param {TeamType} team
 * @returns {Promise<{offers: Array, myOffers: Array, myBids: Array, myCards: Array}>}
 */
export async function getMarket (team) {
  // Open offers from other teams, with the offerer's team name and a bid count.
  const offers = await query(
    `SELECT o.id, o.action, o.comment, o.created_at,
            t.id AS team_id, t.name AS team_name, t.color AS team_color, t.emblem AS team_emblem,
            (SELECT COUNT(*) FROM action_card_bid b WHERE b.offer_id=o.id AND b.status='open') AS bid_count
     FROM action_card_offer o
     JOIN team t ON t.id = o.from_team_id
     WHERE o.status='open' AND o.from_team_id != ?
     ORDER BY o.created_at DESC`,
    [team.id]
  )

  // My open offers, each with its incoming open bids (and each bid's cards).
  const myOfferRows = await query(
    "SELECT * FROM action_card_offer WHERE from_team_id=? AND status='open' ORDER BY created_at DESC",
    [team.id]
  )
  const myOffers = []
  for (const offer of myOfferRows) {
    const bids = await query(
      `SELECT b.id, b.money, b.created_at,
              t.id AS bidder_team_id, t.name AS bidder_team_name
       FROM action_card_bid b
       JOIN team t ON t.id = b.bidder_team_id
       WHERE b.offer_id=? AND b.status='open'
       ORDER BY b.created_at ASC`,
      [offer.id]
    )
    for (const bid of bids) {
      bid.cards = await getBidCards(bid.id)
    }
    myOffers.push({ ...offer, bids })
  }

  // My open bids on other people's offers.
  const myBidRows = await query(
    `SELECT b.id, b.money, b.status, b.created_at,
            o.id AS offer_id, o.action AS offer_action,
            t.name AS offer_team_name
     FROM action_card_bid b
     JOIN action_card_offer o ON o.id = b.offer_id
     JOIN team t ON t.id = o.from_team_id
     WHERE b.bidder_team_id=? AND b.status='open'
     ORDER BY b.created_at DESC`,
    [team.id]
  )
  for (const bid of myBidRows) {
    bid.cards = await getBidCards(bid.id)
  }

  const myCards = await getActionCards(team)

  return { offers, myOffers, myBids: myBidRows, myCards }
}
