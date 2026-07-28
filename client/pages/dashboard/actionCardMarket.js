import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { showOverlay } from '../../partials/overlay.js'
import { t } from '../../i18n/index.js'
import { generateId, el } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { euroFormat } from '../../lib/currency.js'
import { renderEmblem } from '../../partials/emblem.js'
import { preloadAllActionCardSvgs, renderActionCardSvg } from '../../lib/actionCardSvg.js'
import { renderCurrencyInput, setupCurrencyInput } from '../../partials/currencyInput.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'

/**
 * Action-card marketplace: browse open offers and bid (money + cards), manage
 * your own offers (accept/reject incoming bids) and your outgoing bids.
 */
export class ActionCardMarketPage extends UIElement {
  async load () {
    await preloadAllActionCardSvgs()
    const data = await server.getActionCardMarket()
    this._offers = data.offers ?? []
    this._myOffers = data.myOffers ?? []
    this._myBids = data.myBids ?? []
    this._myCards = data.myCards ?? []
  }

  get template () {
    return `
      <div class="card-market mb-5">
        <a class="btn btn-link px-0 mb-2" href="#dashboard?sub_page=cards">
          <i class="fa fa-chevron-left me-1"></i> ${t('cardMarket.backToCards')}
        </a>
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <h3 class="mb-0">${t('cardMarket.title')}</h3>
          <button id="${this._newOfferBtnId}" class="btn btn-info"${this._myCards.length === 0 ? ' disabled' : ''}>
            <i class="fa fa-plus me-1"></i> ${t('cardMarket.newOffer')}
          </button>
        </div>
        <p class="u-max-w-620 text-muted">${t('cardMarket.subtitle')}</p>

        ${this._renderMyOffers()}
        ${this._renderMyBids()}
        ${this._renderOffers()}
      </div>
    `
  }
  get events () {
    return {
      [`(optional)#${this._newOfferBtnId}`]: { click: () => this._showNewOfferOverlay() }
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

  _newOfferBtnId = generateId()

  /**
   * Render a small card thumbnail for an action type.
   * @param {string} action
   * @returns {string}
   */
  _cardThumb (action) {
    return `<span class="card-market-thumb">${renderActionCardSvg(action)}</span>`
  }

  _renderMyOffers () {
    if (this._myOffers.length === 0) return ''
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
            <div class="d-flex align-items-center gap-3 mb-2">
              ${this._cardThumb(offer.action)}
              <div class="flex-grow-1">
                <div class="fw-bold">${t('actionCards.type.' + this._typeKey(offer.action))}</div>
                ${offer.comment ? `<div class="text-muted small">${offer.comment}</div>` : ''}
              </div>
              <button id="${cancelId}" class="btn btn-sm btn-outline-danger">${t('cardMarket.cancel')}</button>
            </div>
            <div class="card-market-bids">${bidsHtml}</div>
          </div>
        </div>
      `
    }).join('')
    return `
      <h5 class="mt-4">${t('cardMarket.myOffers')}</h5>
      ${rows}
    `
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
    if (bid.money > 0) parts.push(`<span class="badge bg-info">${euroFormat.format(bid.money)}</span>`)
    ;(bid.cards ?? []).forEach(c => {
      parts.push(`<span class="badge bg-secondary">${t('actionCards.type.' + this._typeKey(c.action))}</span>`)
    })
    if (parts.length === 0) parts.push(`<span class="text-muted small">—</span>`)
    return `<span class="ms-2 d-inline-flex flex-wrap gap-1 align-middle">${parts.join('')}</span>`
  }

  _renderMyBids () {
    if (this._myBids.length === 0) return ''
    const rows = this._myBids.map(bid => {
      const withdrawId = generateId()
      onClick('#' + withdrawId, () => this._cancelBid(bid.id))
      return `
        <div class="card-market-mybid d-flex align-items-center gap-3 py-2 border-top">
          ${this._cardThumb(bid.offer_action)}
          <div class="flex-grow-1">
            <div class="fw-bold">${t('actionCards.type.' + this._typeKey(bid.offer_action))}</div>
            <div class="text-muted small">${t('cardMarket.offeredBy', { team: bid.offer_team_name })}</div>
            ${this._renderBidValue(bid)}
          </div>
          <button id="${withdrawId}" class="btn btn-sm btn-outline-secondary">${t('cardMarket.withdraw')}</button>
        </div>
      `
    }).join('')
    return `
      <h5 class="mt-4">${t('cardMarket.myBids')}</h5>
      ${rows}
    `
  }

  _renderOffers () {
    const heading = `<h5 class="mt-4">${t('cardMarket.allOffers')}</h5>`
    if (this._offers.length === 0) {
      return `${heading}<p class="text-muted">${t('cardMarket.empty')}</p>`
    }
    const rows = this._offers.map(offer => {
      const bidId = generateId()
      onClick('#' + bidId, () => this._showBidOverlay(offer))
      return `
        <div class="card-market-offer card mb-2">
          <div class="card-body d-flex align-items-center gap-3">
            ${this._cardThumb(offer.action)}
            <div class="flex-grow-1">
              <div class="fw-bold">${t('actionCards.type.' + this._typeKey(offer.action))}</div>
              <div class="text-muted small d-flex align-items-center gap-1">
                ${renderEmblem({ name: offer.team_name, color: offer.team_color, emblem: offer.team_emblem }, 20)}
                ${offer.team_name}
              </div>
              ${offer.comment ? `<div class="text-muted small fst-italic">"${offer.comment}"</div>` : ''}
            </div>
            <button id="${bidId}" class="btn btn-sm btn-info">${t('cardMarket.bid')}</button>
          </div>
        </div>
      `
    }).join('')
    return `${heading}${rows}`
  }

  // ---- Actions -----------------------------------------------------------

  _showNewOfferOverlay () {
    let selectedCardId = null
    const commentId = generateId()
    const confirmId = generateId()
    const listId = generateId()

    // Unique card ids only appear once each in the received inventory.
    const cardChips = this._myCards.map(card => `
      <button type="button" class="card-market-pick" data-card-id="${card.id}">
        ${this._cardThumb(card.action)}
        <span class="small">${t('actionCards.type.' + this._typeKey(card.action))}</span>
      </button>
    `).join('')

    const content = `
      <div class="mb-3">
        <label class="form-label">${t('cardMarket.pickCard')}</label>
        <div id="${listId}" class="card-market-pick-list">${cardChips}</div>
      </div>
      <div class="mb-3">
        <label class="form-label" for="${commentId}">${t('cardMarket.commentLabel')}</label>
        <input id="${commentId}" type="text" class="form-control" maxlength="255" placeholder="${t('cardMarket.commentPlaceholder')}">
      </div>
      <button id="${confirmId}" class="btn btn-info w-100" disabled>${t('cardMarket.createOffer')}</button>
    `
    const overlay = showOverlay(t('cardMarket.newOffer'), '', content)

    onClick('#' + listId, (event) => {
      const chip = event.target.closest('[data-card-id]')
      if (!chip) return
      selectedCardId = Number(chip.dataset.cardId)
      el('#' + listId)?.querySelectorAll('.card-market-pick').forEach(c => {
        c.classList.toggle('card-market-pick--selected', Number(c.dataset.cardId) === selectedCardId)
      })
      const btn = el('#' + confirmId)
      if (btn) btn.disabled = false
    })

    onClick('#' + confirmId, async () => {
      if (!selectedCardId) return
      const comment = el('#' + commentId)?.value ?? ''
      try {
        await server.createActionCardOffer(selectedCardId, comment)
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
    const selectedCards = new Set()

    const cardChips = this._myCards.map(card => `
      <button type="button" class="card-market-pick" data-card-id="${card.id}">
        ${this._cardThumb(card.action)}
        <span class="small">${t('actionCards.type.' + this._typeKey(card.action))}</span>
      </button>
    `).join('')

    const content = `
      <div class="d-flex align-items-center gap-3 mb-3">
        ${this._cardThumb(offer.action)}
        <div>
          <div class="fw-bold">${t('actionCards.type.' + this._typeKey(offer.action))}</div>
          <div class="text-muted small">${t('cardMarket.offeredBy', { team: offer.team_name })}</div>
        </div>
      </div>
      <div class="mb-3">${renderCurrencyInput(moneyId, t('cardMarket.moneyLabel'))}</div>
      <div class="mb-3">
        <label class="form-label">${t('cardMarket.addCards')}</label>
        <div id="${listId}" class="card-market-pick-list">
          ${this._myCards.length === 0 ? `<p class="text-muted small mb-0">${t('cardMarket.noCards')}</p>` : cardChips}
        </div>
      </div>
      <button id="${confirmId}" class="btn btn-info w-100">${t('cardMarket.placeBid')}</button>
    `
    const overlay = showOverlay(t('cardMarket.bid'), '', content)
    setupCurrencyInput(moneyId)

    onClick('#' + listId, (event) => {
      const chip = event.target.closest('[data-card-id]')
      if (!chip) return
      const id = Number(chip.dataset.cardId)
      if (selectedCards.has(id)) selectedCards.delete(id)
      else selectedCards.add(id)
      chip.classList.toggle('card-market-pick--selected', selectedCards.has(id))
    })

    onClick('#' + confirmId, async () => {
      const money = Number(el('#' + moneyId)?.dataset.rawValue ?? 0) || 0
      const cardIds = [...selectedCards]
      if (money === 0 && cardIds.length === 0) {
        toast(t('cardMarket.emptyBid'), 'error')
        return
      }
      try {
        await server.bidOnActionCardOffer(offer.id, money, cardIds)
        overlay.remove()
        toast(t('cardMarket.bidPlaced'), 'success')
        await this.update(true)
      } catch (e) {
        toast(e.message ?? t('cardMarket.actionFailed'), 'error')
      }
    })
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
