import {UIElement} from '../lib/UIElement.js'
import {server} from '../lib/gateway.js'
import {toast} from './toast.js'
import {showOverlay} from './overlay.js'
import {t} from '../i18n/index.js'
import {el, generateId} from '../lib/html.js'
import {onClick} from '../lib/htmlEventHandlers.js'
import {euroFormat} from '../lib/currency.js'
import {renderEmblem} from './emblem.js'
import {preloadAllActionCardSvgs, renderActionCardSvg} from '../lib/actionCardSvg.js'
import {renderCurrencyInput, setupCurrencyInput} from './currencyInput.js'
import {SERVER_EVENTS} from '../lib/serverEvents.js'

/**
 * Action-card marketplace section (embedded on the "Actions" page): browse
 * open offers and bid (money + cards), bundle several cards into one offer,
 * manage your own offers/bids, and review your completed trades.
 */
export class ActionCardMarket extends UIElement {
  async load () {
    await preloadAllActionCardSvgs()
    const [data, history] = await Promise.all([
      server.getActionCardMarket(),
      server.getActionCardTradeHistory()
    ])
    this._offers = data.offers ?? []
    this._myOffers = data.myOffers ?? []
    this._myBids = data.myBids ?? []
    this._myCards = data.myCards ?? []
    this._trades = history.trades ?? []
  }

  get template () {
    return `
      <div class="card-market mt-5 mb-5">
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
          <h3 class="mb-0"><i class="fa fa-exchange me-2"></i>${t('cardMarket.title')}</h3>
          <button id="${this._newOfferBtnId}" class="btn btn-info btn-sm"${this._myCards.length === 0 ? ' disabled' : ''}>
            <i class="fa fa-plus me-1"></i> ${t('cardMarket.newOffer')}
          </button>
        </div>
        <p class="u-max-w-620 text-muted mb-4">${t('cardMarket.subtitle')}</p>

        <div class="mb-3">
          <ul class="nav nav-pills card-market-tabs">
            ${this._renderTab('offers', t('cardMarket.myOffers'), this._myOffers.length)}
            ${this._renderTab('all', t('cardMarket.allOffers'), this._offers.length)}
            ${this._renderTab('bids', t('cardMarket.myBids'), this._myBids.length)}
            ${this._renderTab('trades', t('cardMarket.myTrades'), this._trades.length)}
          </ul>
        </div>

        <div class="card-market-tab-content">
          ${this._renderActiveTab()}
        </div>
      </div>
    `
  }

  get events () {
    return {
      [`(optional)#${this._newOfferBtnId}`]: {click: () => this._showNewOfferOverlay()},
      '.card-market-tabs': {click: (event) => this._onTabClick(event)},
      [`(optional)#${this._offerFilterId}`]: {change: (event) => this._onOfferFilterChange(event)}
    }
  }

  get serverEvents () {
    return {
      [SERVER_EVENTS.ACTION_CARD_MARKET_CHANGED.name]: () => this.update(true),
      [SERVER_EVENTS.ACTION_CARDS_CHANGED.name]: () => this.update(true)
    }
  }

  _offers = []
  _myOffers = []
  _myBids = []
  _myCards = []
  _trades = []

  /** Active marketplace tab: 'offers' | 'all' | 'bids' | 'trades'. */
  _activeTab = 'all'

  /** Selected card-type filter for the "All offers" tab ('' = all types). */
  _offerTypeFilter = ''

  _newOfferBtnId = generateId()
  _offerFilterId = generateId()

  /**
   * Render one marketplace tab pill, with a count badge when non-empty.
   * @param {string} key
   * @param {string} label
   * @param {number} count
   * @returns {string}
   */
  _renderTab (key, label, count) {
    const badge = count > 0 ? ` <span class="badge rounded-pill bg-secondary">${count}</span>` : ''
    return `
      <li class="nav-item">
        <button type="button" class="nav-link ${this._activeTab === key ? 'active' : ''}" data-market-tab="${key}">${label}${badge}</button>
      </li>
    `
  }

  /**
   * Render the section for the currently active tab.
   * @returns {string}
   */
  _renderActiveTab () {
    if (this._activeTab === 'offers') return this._renderMyOffers()
    if (this._activeTab === 'bids') return this._renderMyBids()
    if (this._activeTab === 'trades') return this._renderTrades()
    return this._renderOffers()
  }

  /**
   * Switch tabs on pill click (re-renders without refetching).
   * @param {Event} event
   */
  _onTabClick (event) {
    const btn = event.target.closest('[data-market-tab]')
    if (!btn) return
    const tab = btn.dataset.marketTab
    if (!tab || tab === this._activeTab) return
    this._activeTab = tab
    this.update()
  }

  /**
   * Render a small card thumbnail for an action type.
   * @param {string} action
   * @returns {string}
   */
  _cardThumb (action) {
    return `<span class="card-market-thumb">${renderActionCardSvg(action)}</span>`
  }

  /**
   * Render a row of thumbnails for a bundle of cards.
   * @param {Array<{action: string}>} cards
   * @returns {string}
   */
  _cardThumbs (cards) {
    return `<span class="card-market-thumbs">${(cards ?? []).map(c => this._cardThumb(c.action)).join('')}</span>`
  }

  /**
   * Comma-separated friendly type names for a bundle of cards.
   * @param {Array<{action: string}>} cards
   * @returns {string}
   */
  _cardNames (cards) {
    return (cards ?? []).map(c => t('actionCards.type.' + this._typeKey(c.action))).join(', ')
  }

  _renderMyOffers () {
    if (this._myOffers.length === 0) {
      return `<p class="text-muted mb-0">${t('cardMarket.noMyOffers')}</p>`
    }
    const rows = this._myOffers.map(offer => {
      const bids = offer.bids ?? []
      const bidsHtml = bids.length === 0
        ? `<p class="text-muted small mb-0">${t('cardMarket.noBidsYet')}</p>`
        : bids.map(bid => this._renderIncomingBid(bid)).join('')
      const cancelId = generateId()
      onClick('#' + cancelId, () => this._cancelOffer(offer.id))
      return `
        <div class="card-market-offer card mb-2">
          <div class="card-body">
            <div class="d-flex align-items-center flex-wrap gap-3 mb-2">
              <div class="d-flex align-items-center gap-3 flex-grow-1 card-market-offer-main">
                ${this._cardThumbs(offer.cards)}
                <div class="flex-grow-1">
                  <div class="fw-bold">${this._cardNames(offer.cards)}</div>
                  ${offer.comment ? `<div class="text-muted small">${offer.comment}</div>` : ''}
                </div>
              </div>
              <button id="${cancelId}" class="btn btn-sm btn-outline-danger ms-auto">${t('cardMarket.cancel')}</button>
            </div>
            <div class="card-market-bids">${bidsHtml}</div>
          </div>
        </div>
      `
    }).join('')
    return rows
  }

  _renderIncomingBid (bid) {
    const acceptId = generateId()
    const rejectId = generateId()
    onClick('#' + acceptId, () => this._acceptBid(bid.id))
    onClick('#' + rejectId, () => this._rejectBid(bid.id))
    return `
      <div class="card-market-bid d-flex align-items-center gap-2 py-2 border-top">
        <div class="flex-grow-1">
          <span class="fw-bold">${bid.bidder_team_name}</span>
          ${this._renderBidValue(bid)}
          ${bid.comment ? `<div class="text-muted small fst-italic">"${bid.comment}"</div>` : ''}
        </div>
        <button id="${acceptId}" class="btn btn-sm btn-success"><i class="fa fa-check"></i></button>
        <button id="${rejectId}" class="btn btn-sm btn-danger"><i class="fa fa-times"></i></button>
      </div>
    `
  }

  /**
   * Render the money + cards a bid offers.
   * @param {Object} bid
   * @returns {string}
   */
  _renderBidValue (bid) {
    const parts = []
    if (bid.money > 0) {
      parts.push(`<span class="badge bg-info">${euroFormat.format(bid.money)}</span>`)
      ;
    }
    (bid.cards ?? []).forEach(c => {
      parts.push(`<span class="badge bg-secondary">${t('actionCards.type.' + this._typeKey(c.action))}</span>`)
    })
    if (parts.length === 0) parts.push(`<span class="text-muted small">—</span>`)
    return `<span class="ms-2 d-inline-flex flex-wrap gap-1 align-middle">${parts.join('')}</span>`
  }

  _renderMyBids () {
    if (this._myBids.length === 0) {
      return `<p class="text-muted mb-0">${t('cardMarket.noMyBids')}</p>`
    }
    const rows = this._myBids.map(bid => {
      const withdrawId = generateId()
      onClick('#' + withdrawId, () => this._cancelBid(bid.id))
      return `
        <div class="card-market-mybid card mb-2">
          <div class="card-body d-flex align-items-center gap-3">
            ${this._cardThumbs(bid.offerCards)}
            <div class="flex-grow-1">
              <div class="fw-bold">${this._cardNames(bid.offerCards)}</div>
              <div class="text-muted small">${t('cardMarket.offeredBy', {team: bid.offer_team_name})}</div>
              ${this._renderBidValue(bid)}
            </div>
            <button id="${withdrawId}" class="btn btn-sm btn-outline-secondary">${t('cardMarket.withdraw')}</button>
          </div>
        </div>
      `
    }).join('')
    return rows
  }

  _renderOffers () {
    if (this._offers.length === 0) {
      return `<p class="text-muted mb-0">${t('cardMarket.empty')}</p>`
    }

    const select = this._renderOfferFilter()
    const filter = this._offerTypeFilter
    const filtered = filter
      ? this._offers.filter(offer => (offer.cards ?? []).some(c => c.action === filter))
      : this._offers

    if (filtered.length === 0) {
      return `${select}<p class="text-muted mb-0">${t('cardMarket.empty')}</p>`
    }

    const visible = filtered.slice(0, ALL_OFFERS_LIMIT)
    const rows = visible.map(offer => {
      const bidId = generateId()
      onClick('#' + bidId, () => this._showBidOverlay(offer))
      return `
        <div class="card-market-offer card mb-2">
          <div class="card-body d-flex align-items-center gap-3">
            ${this._cardThumbs(offer.cards)}
            <div class="flex-grow-1">
              <div class="fw-bold">${this._cardNames(offer.cards)}</div>
              <div class="text-muted small d-flex align-items-center gap-1">
                ${renderEmblem({name: offer.team_name, color: offer.team_color, emblem: offer.team_emblem}, 20)}
                ${offer.team_name}
              </div>
              ${offer.comment ? `<div class="text-muted small fst-italic">"${offer.comment}"</div>` : ''}
            </div>
            <button id="${bidId}" class="btn btn-sm btn-info">${t('cardMarket.bid')}</button>
          </div>
        </div>
      `
    }).join('')

    const more = filtered.length > visible.length
      ? `<p class="text-muted small mb-0">${t('cardMarket.showingCount', {
        shown: visible.length,
        total: filtered.length
      })}</p>`
      : ''

    return `${select}${rows}${more}`
  }

  /**
   * Card-type filter dropdown for the "All offers" tab. Options are the
   * distinct card types present across all open offers, plus an "all" option.
   * @returns {string}
   */
  _renderOfferFilter () {
    const types = [...new Set(this._offers.flatMap(offer => (offer.cards ?? []).map(c => c.action)))]
    const options = types.map(action =>
      `<option value="${action}" ${this._offerTypeFilter === action ? 'selected' : ''}>${t('actionCards.type.' + this._typeKey(action))}</option>`
    ).join('')
    return `
      <div class="mb-3">
        <select id="${this._offerFilterId}" class="form-select form-select-sm u-w-auto">
          <option value="" ${!this._offerTypeFilter ? 'selected' : ''}>${t('cardMarket.allTypes')}</option>
          ${options}
        </select>
      </div>
    `
  }

  /**
   * Apply the selected card-type filter and re-render the offers list.
   * @param {Event} event
   */
  _onOfferFilterChange (event) {
    this._offerTypeFilter = event.target.value
    this.update()
  }

  // ---- Actions -----------------------------------------------------------

  _showNewOfferOverlay () {
    const selectedCards = new Set()
    const commentId = generateId()
    const confirmId = generateId()
    const listId = generateId()
    const showAllId = generateId()

    const renderChip = (card) => `
      <button type="button" class="card-market-pick${selectedCards.has(card.id) ? ' card-market-pick--selected' : ''}" data-card-id="${card.id}">
        ${this._cardThumb(card.action)}
        <span class="small">${t('actionCards.type.' + this._typeKey(card.action))}</span>
      </button>
    `

    // Collapsed by default: show a single owned card per type. The "show all"
    // button below reveals every individual card.
    const oneCardPerType = [...new Map(this._myCards.map(card => [card.action, card])).values()]
    const hasMore = this._myCards.length > oneCardPerType.length

    const content = `
      <div class="mb-3">
        <label class="form-label">${t('cardMarket.pickCard')}</label>
        <div id="${listId}" class="card-market-pick-list">${oneCardPerType.map(renderChip).join('')}</div>
        ${hasMore ? `<button type="button" id="${showAllId}" class="btn btn-link btn-sm p-0 mt-2">${t('cardMarket.showAllCards')}</button>` : ''}
      </div>
      <div class="mb-3">
        <label class="form-label" for="${commentId}">${t('cardMarket.commentLabel')}</label>
        <input id="${commentId}" type="text" class="form-control" maxlength="255" placeholder="${t('cardMarket.commentPlaceholder')}">
      </div>
      <button id="${confirmId}" class="btn btn-info w-100" disabled>${t('cardMarket.createOffer')}</button>
    `
    const overlay = showOverlay(t('cardMarket.newOffer'), '', content)

    onClick('#' + showAllId, () => {
      const list = el('#' + listId)
      if (list) list.innerHTML = this._myCards.map(renderChip).join('')
      el('#' + showAllId)?.remove()
    })

    onClick('#' + listId, (event) => {
      const chip = event.target.closest('[data-card-id]')
      if (!chip) return
      const id = Number(chip.dataset.cardId)
      if (selectedCards.has(id)) {
        selectedCards.delete(id)
      } else {
        selectedCards.add(id)
      }
      chip.classList.toggle('card-market-pick--selected', selectedCards.has(id))
      const btn = el('#' + confirmId)
      if (btn) btn.disabled = selectedCards.size === 0
    })

    onClick('#' + confirmId, async () => {
      const cardIds = [...selectedCards]
      if (cardIds.length === 0) return
      const comment = el('#' + commentId)?.value ?? ''
      try {
        await server.createActionCardOffer(cardIds, comment)
        overlay.remove()
        toast(t('cardMarket.offerCreated'), 'success')
        await this.update(true)
      } catch (e) {
        toast(e.message ?? t('cardMarket.actionFailed'), 'error')
      }
    })
  }

  _showBidOverlay (offer) {
    const moneyId = generateId()
    const confirmId = generateId()
    const listId = generateId()
    const showAllId = generateId()
    const commentId = generateId()
    const selectedCards = new Set()

    const renderChip = (card) => `
      <button type="button" class="card-market-pick${selectedCards.has(card.id) ? ' card-market-pick--selected' : ''}" data-card-id="${card.id}">
        ${this._cardThumb(card.action)}
        <span class="small">${t('actionCards.type.' + this._typeKey(card.action))}</span>
      </button>
    `

    // Collapsed by default: show a single owned card per type. The "show all"
    // button below reveals every individual card (the previous behaviour).
    const oneCardPerType = [...new Map(this._myCards.map(card => [card.action, card])).values()]
    const hasMore = this._myCards.length > oneCardPerType.length

    const content = `
      <div class="d-flex align-items-center gap-3 mb-3">
        ${this._cardThumbs(offer.cards)}
        <div>
          <div class="fw-bold">${this._cardNames(offer.cards)}</div>
          <div class="text-muted small">${t('cardMarket.offeredBy', {team: offer.team_name})}</div>
        </div>
      </div>
      <div class="mb-3">${renderCurrencyInput(moneyId, t('cardMarket.moneyLabel'))}</div>
      <div class="mb-3">
        <label class="form-label">${t('cardMarket.addCards')}</label>
        <div id="${listId}" class="card-market-pick-list">
          ${this._myCards.length === 0 ? `<p class="text-muted small mb-0">${t('cardMarket.noCards')}</p>` : oneCardPerType.map(renderChip).join('')}
        </div>
        ${hasMore ? `<button type="button" id="${showAllId}" class="btn btn-link btn-sm p-0 mt-2">${t('cardMarket.showAllCards')}</button>` : ''}
      </div>
      <div class="mb-3">
        <label class="form-label" for="${commentId}">${t('cardMarket.bidCommentLabel')}</label>
        <input id="${commentId}" type="text" class="form-control" maxlength="255" placeholder="${t('cardMarket.bidCommentPlaceholder')}">
      </div>
      <button id="${confirmId}" class="btn btn-info w-100">${t('cardMarket.placeBid')}</button>
    `
    const overlay = showOverlay(t('cardMarket.bid'), '', content)
    setupCurrencyInput(moneyId)

    onClick('#' + listId, (event) => {
      const chip = event.target.closest('[data-card-id]')
      if (!chip) return
      const id = Number(chip.dataset.cardId)
      if (selectedCards.has(id)) {
        selectedCards.delete(id)
      } else {
        selectedCards.add(id)
      }
      chip.classList.toggle('card-market-pick--selected', selectedCards.has(id))
    })

    onClick('#' + showAllId, () => {
      const list = el('#' + listId)
      if (list) list.innerHTML = this._myCards.map(renderChip).join('')
      el('#' + showAllId)?.remove()
    })

    onClick('#' + confirmId, async () => {
      const money = Number(el('#' + moneyId)?.dataset.rawValue ?? 0) || 0
      const cardIds = [...selectedCards]
      const comment = el('#' + commentId)?.value ?? ''
      if (money === 0 && cardIds.length === 0) {
        toast(t('cardMarket.emptyBid'), 'error')
        return
      }
      try {
        await server.bidOnActionCardOffer(offer.id, money, cardIds, comment)
        overlay.remove()
        toast(t('cardMarket.bidPlaced'), 'success')
        await this.update(true)
      } catch (e) {
        toast(e.message ?? t('cardMarket.actionFailed'), 'error')
      }
    })
  }

  /**
   * Render this team's completed (settled) trades tab.
   * @returns {string}
   */
  _renderTrades () {
    if (this._trades.length === 0) {
      return `<p class="text-muted mb-0">${t('cardMarket.noTrades')}</p>`
    }
    return this._trades.map(trade => this._renderTradeRow(trade)).join('')
  }

  /**
   * @param {Object} trade
   * @returns {string}
   */
  _renderTradeRow (trade) {
    const title = trade.role === 'sold'
      ? t('cardMarket.tradeSold', {team: trade.counterparty.name})
      : t('cardMarket.tradeBought', {team: trade.counterparty.name})
    const moneyBadge = trade.money
      ? `<span class="badge ${trade.money > 0 ? 'bg-success' : 'bg-danger'}">${trade.money > 0 ? '+' : ''}${euroFormat.format(trade.money)}</span>`
      : ''
    return `
      <div class="card-market-trade card mb-2">
        <div class="card-body">
          <div class="d-flex align-items-center gap-2 mb-2">
            ${renderEmblem({
    name: trade.counterparty.name,
    color: trade.counterparty.color,
    emblem: trade.counterparty.emblem
  }, 20)}
            <span class="fw-bold flex-grow-1">${title}</span>
            ${moneyBadge}
          </div>
          <div class="card-market-trade-cards">
            <div class="card-market-trade-side">
              <span class="text-muted small">${t('cardMarket.gave')}</span>
              ${this._cardThumbs(trade.gaveCards)}
            </div>
            <div class="card-market-trade-side">
              <span class="text-muted small">${t('cardMarket.got')}</span>
              ${this._cardThumbs(trade.gotCards)}
            </div>
          </div>
        </div>
      </div>
    `
  }

  async _cancelOffer (offerId) {
    await this._runAction(() => server.cancelActionCardOffer(offerId), t('cardMarket.offerCancelled'))
  }

  async _acceptBid (bidId) {
    await this._runAction(() => server.acceptActionCardBid(bidId), t('cardMarket.bidAccepted'))
  }

  async _rejectBid (bidId) {
    await this._runAction(() => server.rejectActionCardBid(bidId), t('cardMarket.bidRejected'))
  }

  async _cancelBid (bidId) {
    await this._runAction(() => server.cancelActionCardBid(bidId), t('cardMarket.bidWithdrawn'))
  }

  /**
   * Run a marketplace mutation, toast the result and refresh.
   * @param {() => Promise<any>} fn
   * @param {string} successMessage
   */
  async _runAction (fn, successMessage) {
    try {
      await fn()
      toast(successMessage, 'success')
      await this.update(true)
    } catch (e) {
      toast(e.message ?? t('cardMarket.actionFailed'), 'error')
    }
  }

  /**
   * Map a full action string to its `actionCards.type.*` i18n sub-key.
   * @param {string} action
   * @returns {string}
   */
  _typeKey (action) {
    return TYPE_KEYS[action] ?? action
  }
}

/** Max number of offers shown at once in the "All offers" tab. */
const ALL_OFFERS_LIMIT = 6

/**
 * Action string → `actionCards.type.<key>` i18n sub-key. Mirrors the map in
 * the action-card views so marketplace listings show friendly names.
 * @type {Object<string, string>}
 */
const TYPE_KEYS = {
  LEVEL_UP_PLAYER_100: 'legendaryMastery',
  LEVEL_UP_PLAYER_70: 'epicAdvancement',
  LEVEL_UP_PLAYER_40: 'basicPromotion',
  NEW_YOUTH_PLAYER_1: 'youthProspect1',
  NEW_YOUTH_PLAYER_2: 'youthProspect2',
  NEW_YOUTH_PLAYER_3: 'youthProspect3',
  FRESHNESS_5: 'quickRecovery',
  FRESHNESS_10: 'energyBoost',
  FRESHNESS_20: 'fullRecovery',
  BONUS_100K: 'cashBonus',
  STAR_PLAYER: 'starPlayer',
  MOTIVATING_SPEECH: 'motivatingSpeech',
  SPY: 'spy'
}
