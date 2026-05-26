import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { showDialog } from '../../partials/dialog.js'
import { showOverlay } from '../../partials/overlay.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../lib/currency.js'
import { Table } from '../../partials/table.js'
import { getQueryParams, goTo, setQueryParams } from '../../lib/router.js'
import { calculatePlayerAge, sortByPosition } from '../../util/player.js'
import { t } from '../../i18n/index.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'
import { renderPositionBadge } from '../../partials/positionBadge.js'
import { Position } from '../../util/formation.js'
import { renderPageNumbers } from '../../partials/pagination.js'
import { renderCurrencyInput, setupCurrencyInput } from '../../partials/currencyInput.js'
import { el, generateId } from '../../lib/html.js'

const PAGE_SIZE = 20

export class MarketPage extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    const teamResponse = await server.getMyTeam()
    this.team = teamResponse.team

    const { season } = await server.getCurrentGameday()
    this.season = season

    const offersResponse = await server.getOffers()
    this.offers = offersResponse.offers
    this.players = offersResponse.players
    this.teams = offersResponse.teams

  }

  /**
   * @returns {string}
   */
  get template () {
    let sellOffers = this._getFilteredOffers()

    // Sort the full dataset before slicing for pagination
    const {
      sort_dir: sortDir,
      col
    } = getQueryParams()
    if (sortDir && col !== undefined) {
      const cols = this._prepareTableCols()
      const colConfig = cols[Number(col)]
      if (colConfig && (colConfig.sortFn || colConfig.sortKey)) {
        sellOffers = [...sellOffers].sort((a, b) => {
          if (colConfig.sortFn) {
            return colConfig.sortFn(a, b, sortDir !== 'DESC')
          }
          return sortDir === 'ASC'
            ? a[colConfig.sortKey] - b[colConfig.sortKey]
            : b[colConfig.sortKey] - a[colConfig.sortKey]
        })
      }
    }

    const start = this._page * PAGE_SIZE
    const pageData = sellOffers.slice(start, start + PAGE_SIZE)

    const positionOptions = Object.values(Position).map(pos =>
      `<option value="${pos}" ${this._positionFilter === pos ? 'selected' : ''}>${t('actionCards.position.' + pos)}</option>`
    ).join('')

    const table = new Table({
      data: pageData,
      cols: this._prepareTableCols(),
      renderRow: offer => {
        const player = this.players.find(p => p.id === offer.player_id)
        const offerTeam = this.teams.find(t => t.id === offer.from_team_id)
        return [
          player.name,
          offerTeam.name,
          renderPositionBadge(player.position),
          calculatePlayerAge(player, this.season),
          renderLevelBadge(player.level),
          euroFormat.format(offer.offer_value),
          `<button class="btn btn-primary" data-buy-player="${player.id}">${t('trades.buy')}</button>`
        ]
      }
    })

    return `
      <div class="market-page">
        <h2>${t('trades.transferMarket')}</h2>
        <p>${t('trades.transferMarketDesc')}</p>
        <div class="mb-3 d-flex flex-wrap align-items-end gap-3">
          <div>
            <label for="market-position-select" class="form-label">${t('trades.position')}</label>
            <select id="market-position-select" class="form-select form-select-sm u-w-auto">
              <option value="" ${!this._positionFilter ? 'selected' : ''}>${t('trades.all')}</option>
              ${positionOptions}
            </select>
          </div>
          <div>
            <label for="market-min-age" class="form-label">${t('trades.minAge')}</label>
            <input id="market-min-age" type="number" class="form-control form-control-sm u-w-80" min="15" max="40" value="${this._minAge}">
          </div>
          <div>
            <label for="market-max-age" class="form-label">${t('trades.maxAge')}</label>
            <input id="market-max-age" type="number" class="form-control form-control-sm u-w-80" min="15" max="40" value="${this._maxAge}">
          </div>
          <div>
            <label for="market-min-level" class="form-label">${t('trades.minLevel')}</label>
            <input id="market-min-level" type="number" class="form-control form-control-sm u-w-80" min="1" max="100" value="${this._minLevel}">
          </div>
          <div>
            <label for="market-max-level" class="form-label">${t('trades.maxLevel')}</label>
            <input id="market-max-level" type="number" class="form-control form-control-sm u-w-80" min="1" max="100" value="${this._maxLevel}">
          </div>
        </div>
        ${table}
        <div class="market-pagination">
          ${this._renderPagination(sellOffers.length)}
        </div>
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.market-page': {
        click: (event) => {
          const target = event.target
          const buyBtn = target.closest('[data-buy-player]')
          if (!buyBtn) return

          const playerId = Number(buyBtn.dataset.buyPlayer)
          const player = this.players.find(p => p.id === playerId)
          if (player) {
            void this._showBuyDialog(player)
          }
        }
      },
      '#market-position-select': {
        change: (event) => {
          this._positionFilter = event.target.value
          this._page = 0
          void this.update()
        }
      },
      '#market-min-age': {
        change: (event) => {
          this._minAge = event.target.value
          this._page = 0
          void this.update()
        }
      },
      '#market-max-age': {
        change: (event) => {
          this._maxAge = event.target.value
          this._page = 0
          void this.update()
        }
      },
      '#market-min-level': {
        change: (event) => {
          this._minLevel = event.target.value
          this._page = 0
          void this.update()
        }
      },
      '#market-max-level': {
        change: (event) => {
          this._maxLevel = event.target.value
          this._page = 0
          void this.update()
        }
      },
      '(optional).market-pagination': {
        click: (event) => {
          const target = event.target

          if (target.closest('.market-prev')) {
            this._loadPage(this._page - 1)
            return
          }

          if (target.closest('.market-next')) {
            this._loadPage(this._page + 1)
            return
          }

          const pageLink = target.closest('[data-page-index]')
          if (pageLink) {
            this._loadPage(parseInt(pageLink.dataset.pageIndex, 10))
          }
        }
      }
    }
  }

  /**
   * @param {Object} params
   * @param {string} params.sort_dir
   * @param {string} params.col
   */
  async onQueryChanged ({
    sort_dir,
    col
  }) {
    if (sort_dir && col !== undefined) {
      const scrollContainer = document.querySelector(`${this._elementQuery} .horizontal-scrollable-table`)
      const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0
      this._page = 0
      await this.update()
      if (scrollLeft > 0) {
        this._restoreScrollLeft(scrollLeft)
      }
    }
  }

  /**
   * Poll for the scroll container (which renders asynchronously via child UIElement)
   * and restore the horizontal scroll position once it appears.
   * @param {number} scrollLeft
   * @param {number} [attempts]
   */
  _restoreScrollLeft (scrollLeft, attempts = 0) {
    const container = document.querySelector(`${this._elementQuery} .horizontal-scrollable-table`)
    if (container) {
      container.scrollLeft = scrollLeft
    } else if (attempts < 50) {
      setTimeout(() => this._restoreScrollLeft(scrollLeft, attempts + 1), 10)
    }
  }

  team = {}

  offers = []
  players = []
  teams = []
  _page = 0
  _positionFilter = ''
  _minAge = '16'
  _maxAge = '40'
  _minLevel = '1'
  _maxLevel = '100'

  /**
   * @returns {Array}
   */
  _prepareTableCols () {
    return [{
      name: t('results.name'),
      onClick: (offer) => {
        setQueryParams({ player_id: offer.player_id })
      }
    }, {
      name: t('results.team'),
      onClick: (offer) => {
        const team = this.teams.find(t => t.id === offer.from_team_id)
        if (team?.is_system_team) {
          toast(t('trades.noTeamInfo'))
          return
        }
        goTo(`team?id=${offer.from_team_id}`)
      }
    }, {
      name: t('player.position'),
      sortFn: (offerA, offerB, isAsc) => {
        const playerA = this.players.find(p => p.id === offerA.player_id)
        const playerB = this.players.find(p => p.id === offerB.player_id)
        if (isAsc) {
          return sortByPosition(playerB, playerA)
        }
        return sortByPosition(playerA, playerB)
      }
    }, {
      name: t('player.age'),
      class: 'table-nums',
      sortFn: (offerA, offerB, isAsc) => {
        const playerA = this.players.find(p => p.id === offerA.player_id)
        const playerB = this.players.find(p => p.id === offerB.player_id)
        const ageA = calculatePlayerAge(playerA, this.season)
        const ageB = calculatePlayerAge(playerB, this.season)
        return isAsc ? ageA - ageB : ageB - ageA
      },
      align: 'right'
    }, {
      name: t('player.level'),
      sortFn: (offerA, offerB, isAsc) => {
        const playerA = this.players.find(p => p.id === offerA.player_id)
        const playerB = this.players.find(p => p.id === offerB.player_id)
        if (isAsc) {
          return playerA.level - playerB.level
        }
        return playerB.level - playerA.level
      },
      align: 'right'
    }, {
      name: t('trades.price'),
      align: 'right',
      class: 'table-nums',
      sortKey: 'offer_value'
    }, {
      name: '',
    }]
  }

  /**
   * @param {number} totalItems
   * @returns {string}
   */
  _renderPagination (totalItems) {
    const totalPages = Math.ceil(totalItems / PAGE_SIZE)
    if (totalPages <= 1) return ''

    const hasPrev = this._page > 0
    const hasNext = this._page < totalPages - 1

    const pageNumbers = renderPageNumbers(totalPages, this._page)

    return `
      <nav class="mt-3">
        <ul class="pagination pagination-sm justify-content-center flex-wrap">
          <li class="page-item ${hasPrev ? '' : 'disabled'}">
            <span class="page-link market-prev u-cursor-pointer">${t('common.prev')}</span>
          </li>
          ${pageNumbers}
          <li class="page-item ${hasNext ? '' : 'disabled'}">
            <span class="page-link market-next u-cursor-pointer">${t('common.next')}</span>
          </li>
        </ul>
      </nav>
    `
  }

  /**
   * @param {number} pageIndex
   */
  _loadPage (pageIndex) {
    const sellOffers = this._getFilteredOffers()
    const totalPages = Math.ceil(sellOffers.length / PAGE_SIZE)
    if (pageIndex < 0 || pageIndex >= totalPages) return
    this._page = pageIndex
    this.update()
  }

  /**
   * Get filtered sell offers (excluding own team, applying position filter)
   * @returns {Array}
   */
  _getFilteredOffers () {
    let sellOffers = this.offers.filter(o => o.type === 'sell' && o.from_team_id !== this.team.id)
    if (this._positionFilter || this._minAge || this._maxAge || this._minLevel || this._maxLevel) {
      sellOffers = sellOffers.filter(o => {
        const player = this.players.find(p => p.id === o.player_id)
        if (!player) return false
        if (this._positionFilter && player.position !== this._positionFilter) return false
        if (this._minAge || this._maxAge) {
          const age = calculatePlayerAge(player, this.season)
          if (this._minAge && age < Number(this._minAge)) return false
          if (this._maxAge && age > Number(this._maxAge)) return false
        }
        if (this._minLevel && player.level < Number(this._minLevel)) return false
        if (this._maxLevel && player.level > Number(this._maxLevel)) return false
        return true
      })
    }
    return sellOffers
  }

  /**
   * @param {Object} player
   * @returns {Promise<void>}
   */
  async _showBuyDialog (player) {
    const sellOffer = this.offers.find(o => o.player_id === player.id && o.type === 'sell')
    const sellOfferPrice = sellOffer ? sellOffer.offer_value : null
    const allowInstantBuy = sellOffer ? sellOffer.allow_instant_buy !== 0 : false

    const inputId = generateId()
    const instantBuyBtnId = generateId()
    const submitBtnId = generateId()
    const cancelBtnId = generateId()

    const formattedPrice = sellOfferPrice != null ? euroFormat.format(sellOfferPrice) : null

    let instantBuySection
    if (sellOfferPrice != null && allowInstantBuy) {
      instantBuySection = `
        <div class="alert alert-success d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <span>${t('trades.askingPrice')}: <b>${formattedPrice}</b></span>
          <button id="${instantBuyBtnId}" type="button" class="btn btn-success btn-sm">${t('trades.instantBuyFor', { price: formattedPrice })}</button>
        </div>
        <p>${t('trades.orMakeOffer')}</p>
      `
    } else if (sellOfferPrice != null) {
      instantBuySection = `
        <div class="alert alert-info mb-3">
          ${t('trades.askingPrice')}: <b>${formattedPrice}</b>
        </div>
        <p>${t('trades.enterOfferValue')}</p>
      `
    } else {
      instantBuySection = `<p>${t('trades.enterOfferValue')}</p>`
    }

    const content = `
      ${instantBuySection}
      <p>${renderCurrencyInput(inputId, t('trades.price'))}</p>
      <button id="${cancelBtnId}" type="button" class="btn btn-secondary">${t('dialog.cancel')}</button>
      <button id="${submitBtnId}" type="button" class="btn btn-primary">${t('trades.submitOffer')}</button>
    `

    const overlay = showOverlay(t('trades.buyPlayer', { playerName: player.name }), '', content)
    setupCurrencyInput(inputId)

    setTimeout(() => {
      const cancelBtn = el('#' + cancelBtnId)
      const submitBtn = el('#' + submitBtnId)
      const instantBtn = el('#' + instantBuyBtnId)

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => overlay.remove())
      }

      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          const input = el('#' + inputId)
          const price = Number(input?.dataset.rawValue || 0)
          if (price <= 0) {
            toast(t('trades.validPrice'), 'error')
            return
          }
          try {
            await server.addTradeOffer(player, price, 'buy')
            toast(t('trades.sentBuyOffer'))
            overlay.remove()
            await this.load()
            await this.update()
          } catch (e) {
            console.error(e)
            toast(e.message ?? t('toast.somethingWentWrong'), 'error')
          }
        })
      }

      if (instantBtn) {
        instantBtn.addEventListener('click', async () => {
          overlay.remove()
          await this._confirmAndInstantBuy(player, sellOfferPrice)
        })
      }
    })
  }

  /**
   * @param {Object} player
   * @param {number} sellOfferPrice
   * @returns {Promise<void>}
   */
  async _confirmAndInstantBuy (player, sellOfferPrice) {
    const formattedPrice = euroFormat.format(sellOfferPrice)
    const { ok } = await showDialog({
      title: t('trades.instantBuyConfirmTitle', { playerName: player.name }),
      text: t('trades.instantBuyConfirmText', {
        playerName: player.name,
        price: formattedPrice
      }),
      hasInput: false,
      buttonText: t('trades.instantBuyYes'),
      buttonType: 'success'
    })
    if (!ok) return
    try {
      await server.instantBuyPlayer(player.id)
      toast(t('trades.instantBuyDone', {
        playerName: player.name,
        price: formattedPrice
      }), 'success')
      await this.load()
      await this.update()
    } catch (e) {
      console.error(e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderMarket () {
  return new MarketPage().toString()
}
