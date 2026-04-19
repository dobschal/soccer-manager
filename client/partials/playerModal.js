import { showOverlay } from './overlay.js'
import { server } from '../lib/gateway.js'
import { calculatePlayerAge, calculateMarketValue, getSalary } from '../util/player.js'
import { renderCurrencyInput, setupCurrencyInput } from './currencyInput.js'
import { euroFormat } from '../lib/currency.js'
import { el } from '../lib/html.js'
import { toast } from './toast.js'
import { Button } from './button.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { renderPlayerImage } from './playerImage.js'
import { showDialog } from './dialog.js'
import { renderAsync } from '../lib/renderAsync.js'
import { t } from '../i18n/index.js'
import { getLevelColor } from './levelBadge.js'
import { UIElement } from '../lib/UIElement.js'
import { getPositionColorClass } from '../util/formation.js'

/**
 * Get color for freshness (red/yellow/green)
 * @param {number} freshness
 * @returns {string}
 */
function getFreshnessColor (freshness) {
  if (freshness >= 0.7) return '#28a745' // Green
  if (freshness >= 0.4) return '#ffc107' // Yellow
  return '#dc3545' // Red
}

/**
 * Format currency amount compactly (e.g., 3543 → "3.5K€")
 * @param {number} amount
 * @returns {string}
 */
function formatCompactCurrency (amount) {
  if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M€'
  if (amount >= 1000) return (amount / 1000).toFixed(1) + 'K€'
  return amount + '€'
}

/**
 * @param {PlayerHistoryType} item
 * @returns {string}
 * @private
 */
const _renderPlayerHistory = renderAsync(async function (item) {
  const prefix = `<small class="text-muted">S${item.season + 1} D${item.game_day}</small>`
  if (item.type === 'LEVEL_UP') {
    return `<div>${prefix} ${t('player.historyLevelUp', { level: item.value })}</div>`
  } else if (item.type === 'TRANSFER') {
    const { team } = await server.getTeam(Number(item.value))
    return `<div>${prefix} ${t('player.historyTransfer', { teamName: team?.name ?? 'Unknown' })}</div>`
  } else if (item.type === 'FIRED') {
    return `<div>${prefix} ${t('player.historyFired', { teamName: item.value })}</div>`
  } else if (item.type === 'HIRED') {
    return `<div>${prefix} ${t('player.historyHired', { teamName: item.value })}</div>`
  } else if (item.type === 'CHANGE_PLAYER_POSITION') {
    return `<div>${prefix} ${t('player.historyPositionChange', { position: item.value })}</div>`
  } else if (item.type === 'STAR_PLAYER') {
    return `<div>${prefix} ⭐ ${t('player.historyStarPlayer')}</div>`
  }
  return `<div>${prefix} ${item.type}: ${item.value}</div>`
})

export default class PlayerModal extends UIElement {
  /**
   * @param {number} playerId
   */
  constructor (playerId) {
    super()
    this.playerId = playerId
    /** @type {{ onClose: (cb: () => void) => void, remove: () => void } | null} */
    this.overlay = null
    this.historyPage = 0
    this.historyPageSize = 5
  }

  async load () {
    this.player = await server.getPlayerById(this.playerId)
    const { season } = await server.getCurrentGameday()
    this.season = season
    const { team: myTeam } = await server.getMyTeam()
    this.myTeam = myTeam
    this.isMyPlayer = myTeam.id === this.player.team_id
    this.isFreeAgent = !this.player.team_id
    this.playersTeam = this.player.team_id ? (await server.getTeam(this.player.team_id)).team : null
    const isCaptain = this.playersTeam && this.player.id === this.playersTeam.captain_id
    this.playerImage = await renderPlayerImage(this.player, this.playersTeam, 224, { isCaptain })
    this.price = calculateMarketValue(this.player.level, calculatePlayerAge(this.player, this.season))
    this.history = await server.getPlayerHistory(this.player.id)
    const { offer } = await server.myOfferForPlayer(this.player)
    this.offer = offer
    const { hasSellOffer, sellOfferPrice } = await server.hasPlayerSellOffer(this.player.id)
    this.hasSellOffer = hasSellOffer
    this.sellOfferPrice = sellOfferPrice
  }

  get template () {
    const levelColor = getLevelColor(this.player.level)
    const freshnessColor = getFreshnessColor(this.player.freshness)
    const fireButton = new Button(t('player.fireBtn'), () => this._onFire(), 'danger', 'mb-4')

    return `
      <div>
        <div class="d-flex flex-column flex-sm-row align-items-center align-items-sm-start gap-3 mb-4">
          <div class="player-modal__image">${this.playerImage}</div>
          <div class="d-flex flex-column justify-content-center">
            <div class="d-flex flex-wrap justify-content-center justify-content-sm-start gap-2">
              <div class="stat-card bg-dark">
                <div class="stat-card-label">${t('player.position')}</div>
                <div class="stat-card-value ${getPositionColorClass(this.player.position)}">${this.player.position}</div>
              </div>
              <div class="stat-card bg-dark">
                <div class="stat-card-label">${t('player.age')}</div>
                <div class="stat-card-value">${calculatePlayerAge(this.player, this.season)}</div>
              </div>
              <div class="stat-card bg-dark">
                <div class="stat-card-label">${t('player.level')}</div>
                <div class="stat-card-value" style="color: ${levelColor};">${this.player.level}</div>
              </div>
              <div class="stat-card bg-dark">
                <div class="stat-card-label">${t('player.freshness')}</div>
                <div class="stat-card-value" style="color: ${freshnessColor}">${Math.floor(this.player.freshness * 100)}%</div>
              </div>
              <div class="stat-card bg-dark">
                <div class="stat-card-label">${t('player.salary')}</div>
                <div class="stat-card-value">${formatCompactCurrency(getSalary(this.player.level))}</div>
              </div>
              <div class="stat-card bg-dark">
                <div class="stat-card-label">${t('player.value')}</div>
                <div class="stat-card-value">${formatCompactCurrency(this.price)}</div>
              </div>
            </div>
          </div>
        </div>
        ${this.player.is_star_player ? `
        <div class="alert alert-warning mb-4">
          <b>⭐ ${t('player.starPlayer')}</b><br>
          ${t('player.starPlayerDesc')}
        </div>
        ` : ''}
        <div class="player-modal__section ${this.isFreeAgent ? 'hidden' : ''} ${this.offer ? 'hidden' : ''} mb-4">
          <b>💰 ${this.isMyPlayer ? t('player.sellPlayer') : t('player.buyPlayer')}</b>
          ${!this.isMyPlayer && this.sellOfferPrice ? `<p>${t('player.askingPrice')}: <b>${euroFormat.format(this.sellOfferPrice)}</b></p>` : `<p>${t('player.enterPrice')}</p>`}
          ${renderCurrencyInput('trade-price-input', t('player.pricePlaceholder'))}
          <button class="trade-offer-btn btn btn-primary mt-2" type="button">
            ${this.isMyPlayer ? t('player.sell') : t('player.submitOffer')}
          </button>
        </div>
        <div class="player-modal__section ${this.isFreeAgent ? '' : 'hidden'} mb-4">
          <b>🤝 ${t('player.hirePlayer')}</b>
          <p>${t('player.hirePlayerDesc')}</p>
          <button class="hire-btn btn btn-primary">
            ${t('player.hireBtn', { playerName: this.player.name })}
          </button>
        </div>
        <div class="mb-4">
          <b><i class="fa fa-calendar" aria-hidden="true"></i> ${t('player.history')}</b>
          <div class="history-items">
            ${this._getHistoryPageItems().map(_renderPlayerHistory).join('')}
          </div>
          ${this.history.length === 0 ? `<p>${t('player.noHistory')}</p>` : ''}
          ${this.history.length > this.historyPageSize ? `
          <div class="d-flex justify-content-between align-items-center mt-2">
            <button class="history-prev-btn btn btn-sm btn-outline-secondary" ${this.historyPage === 0 ? 'disabled' : ''}><i class="fa fa-chevron-left"></i></button>
            <small class="text-muted history-page-info">${this.historyPage + 1} / ${Math.ceil(this.history.length / this.historyPageSize)}</small>
            <button class="history-next-btn btn btn-sm btn-outline-secondary" ${this.historyPage >= Math.ceil(this.history.length / this.historyPageSize) - 1 ? 'disabled' : ''}><i class="fa fa-chevron-right"></i></button>
          </div>
          ` : ''}
        </div>
        <div class="mb-4 ${this.hasSellOffer ? '' : 'hidden'}">
          💰 ${t('player.onMarket')} <a href="#trades">${t('trades.market')}</a>
        </div>
        <div class="${this.isMyPlayer ? '' : 'hidden'}">
          <b>${t('player.firePlayer')}</b>
          <p>${t('player.firePlayerDesc')}</p>
          ${fireButton}
        </div>
      </div>
    `
  }
  get events () {
    return {
      '(optional).trade-offer-btn': { click: this._onTradeOffer },
      '(optional).hire-btn': { click: this._onHire },
      '(optional)#trade-price-input': {
        keydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            void this._onTradeOffer()
          }
        }
      },
      '(optional).history-prev-btn': {
        click: () => {
          if (this.historyPage > 0) {
            this.historyPage--
            this._renderHistoryPage()
          }
        }
      },
      '(optional).history-next-btn': {
        click: () => {
          const totalPages = Math.ceil(this.history.length / this.historyPageSize)
          if (this.historyPage < totalPages - 1) {
            this.historyPage++
            this._renderHistoryPage()
          }
        }
      }
    }
  }
  onMounted () {
    const root = el(this._elementQuery)
    const overlayCard = root.closest('.overlay')
    if (!overlayCard) return

    const titleEl = overlayCard.querySelector('.card-title')
    const subtitleEl = overlayCard.querySelector('.card-subtitle')

    setupCurrencyInput('trade-price-input')

    if (titleEl) titleEl.textContent = this.player.name + (this.player.is_star_player ? ' ⭐' : '')
    if (subtitleEl) {
      if (this.playersTeam && this.playersTeam.is_system_team) {
        subtitleEl.innerHTML = `<span class="text-muted">${this.playersTeam.name}</span>`
      } else if (this.playersTeam) {
        subtitleEl.innerHTML = `<span class="text-info u-cursor-pointer">${this.playersTeam.name}</span>`
        subtitleEl.querySelector('span').addEventListener('click', () => {
          goTo(`team?id=${this.playersTeam.id}`)
          this.overlay.remove()
        })
      } else {
        subtitleEl.innerHTML = `<span class="text-muted">${t('player.freePlayer')}</span>`
      }
    }
  }

  _getHistoryPageItems () {
    const start = this.historyPage * this.historyPageSize
    return this.history.slice(start, start + this.historyPageSize)
  }

  _renderHistoryPage () {
    const root = el(this._elementQuery)
    if (!root) return
    const container = root.querySelector('.history-items')
    if (container) {
      container.innerHTML = this._getHistoryPageItems().map(_renderPlayerHistory).join('')
    }
    const totalPages = Math.ceil(this.history.length / this.historyPageSize)
    const prevBtn = root.querySelector('.history-prev-btn')
    const nextBtn = root.querySelector('.history-next-btn')
    const pageInfo = root.querySelector('.history-page-info')
    if (prevBtn) prevBtn.disabled = this.historyPage === 0
    if (nextBtn) nextBtn.disabled = this.historyPage >= totalPages - 1
    if (pageInfo) pageInfo.textContent = `${this.historyPage + 1} / ${totalPages}`
  }

  async _onTradeOffer () {
    try {
      const root = el(this._elementQuery)
      const input = root?.querySelector('#trade-price-input')
      const price = Number(input?.dataset.rawValue || 0)
      await server.addTradeOffer(this.player, price, this.isMyPlayer ? 'sell' : 'buy')
      toast(t('player.offerAdded', { playerName: this.player.name }), 'success')
      this.overlay.remove()
    } catch (e) {
      console.error(e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }

  async _onHire () {
    try {
      const { ok } = await showDialog({
        title: t('player.hireConfirmTitle', { playerName: this.player.name }),
        text: t('player.hireConfirmText', {
          playerName: this.player.name,
          salary: getSalary(this.player.level)
        }),
        hasInput: false,
        buttonText: t('player.yesHire'),
        buttonType: 'success'
      })
      if (!ok) return
      await server.givePlayerContract(this.player.id)
      toast(t('player.contractGiven', { playerName: this.player.name }), 'success')
      this.overlay.remove()
      window.dispatchEvent(new CustomEvent('player-hired', { detail: { playerId: this.player.id } }))
    } catch (e) {
      console.error(e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }

  async _onFire () {
    try {
      const { ok } = await showDialog({
        title: t('player.fireConfirmTitle'),
        text: t('player.fireConfirmText', { playerName: this.player.name }),
        hasInput: false,
        buttonText: t('player.yesFire')
      })
      if (!ok) return
      await server.firePlayer(this.player)
      toast(t('player.playerFired'))
      this.overlay.remove()
      window.dispatchEvent(new CustomEvent('player-fired', { detail: { playerId: this.player.id } }))
      goTo('my-team')
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }
}

/**
 * @param {number} playerId
 */
export function showPlayerModal (playerId) {
  const modal = new PlayerModal(playerId)
  const overlay = showOverlay(t('common.loading'), '', `${modal}`)
  modal.overlay = overlay
  overlay.onClose(() => {
    setQueryParams({ player_id: null })
  })
}
