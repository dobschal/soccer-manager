import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { showDialog } from '../../partials/dialog.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../lib/currency.js'
import { Table } from '../../partials/table.js'
import { getQueryParams, goTo, setQueryParams } from '../../lib/router.js'
import { calculatePlayerAge, sortByPosition } from '../../util/player.js'
import { t } from '../../i18n/index.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'
import { Position } from '../../util/formation.js'
import { renderPageNumbers } from '../../partials/pagination.js'

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
          player.position,
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
  onQueryChanged ({
    sort_dir,
    col
  }) {
    if (sort_dir && col !== undefined) {
      this._page = 0
      this.update()
    }
  }
  team = {}

  offers = []
  players = []
  teams = []
  _page = 0
  _positionFilter = ''
  _minAge = ''
  _maxAge = ''
  _minLevel = ''
  _maxLevel = ''

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
    const {
      ok,
      value
    } = await showDialog({
      title: t('trades.buyPlayer', { playerName: player.name }),
      text: t('trades.enterOfferValue'),
      hasInput: true,
      inputType: 'currency',
      inputLabel: t('trades.price'),
      buttonText: t('trades.submitOffer')
    })

    if (!ok) return

    const price = Number(value)
    if (price <= 0) {
      toast(t('trades.validPrice'), 'error')
      return
    }

    try {
      await server.addTradeOffer(player, price, 'buy')
      toast(t('trades.sentBuyOffer'))
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
