import { showOverlay } from './overlay.js'
import { server } from '../lib/gateway.js'
import { calculatePlayerAge, getSalary } from '../util/player.js'
import { el } from '../lib/html.js'
import { toast } from './toast.js'
import { renderButton } from './button.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { renderPlayerImage } from './playerImage.js'
import { showDialog } from './dialog.js'
import { renderAsync } from '../lib/renderAsync.js'
import { t } from '../i18n/index.js'
import { getLevelColor } from './levelBadge.js'
import { UIElement } from '../lib/UIElement.js'

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
    this.playerImage = await renderPlayerImage(this.player, this.playersTeam)
    this.price = await server.estimateValue(this.player.id)
    this.history = await server.getPlayerHistory(this.player.id)
    const { offer } = await server.myOfferForPlayer(this.player)
    this.offer = offer
    const { hasSellOffer } = await server.hasPlayerSellOffer(this.player.id)
    this.hasSellOffer = hasSellOffer
  }

  get events () {
    return {
      '(optional).trade-offer-btn': { click: this._onTradeOffer },
      '(optional).hire-btn': { click: this._onHire }
    }
  }

  get template () {
    const levelColor = getLevelColor(this.player.level)
    const freshnessColor = getFreshnessColor(this.player.freshness)
    const fireButton = renderButton(t('player.fireBtn'), () => this._onFire(), 'danger')

    return `
      <div>
        <div class="d-flex flex-column flex-sm-row align-items-center align-items-sm-start gap-3 mb-4">
          <div style="flex-shrink: 0;">${this.playerImage}</div>
          <div class="d-flex flex-column justify-content-center">
            <div class="d-flex flex-wrap justify-content-center justify-content-sm-start gap-2">
              <div class="stat-card bg-dark">
                <div class="stat-card-label">${t('player.position')}</div>
                <div class="stat-card-value">${this.player.position}</div>
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
        <div class="${this.isFreeAgent ? 'hidden' : ''} ${this.offer ? 'hidden' : ''} mb-4" style="clear: both">
          <b>💰 ${this.isMyPlayer ? t('player.sellPlayer') : t('player.buyPlayer')}</b>
          <p>${t('player.enterPrice')}</p>
          <div class="input-group mb-3">
            <input type="number"
                   class="trade-price-input form-control"
                   placeholder="${t('player.pricePlaceholder')}"
                   aria-label="${t('player.pricePlaceholder')}"
                   aria-describedby="Yeah">
            <div class="input-group-append">
              <button class="trade-offer-btn btn btn-outline-primary" type="button">
                ${this.isMyPlayer ? t('player.sell') : t('player.submitOffer')}
              </button>
            </div>
          </div>
        </div>
        <div class="${this.isFreeAgent ? '' : 'hidden'} mb-4" style="clear: both">
          <b>🤝 ${t('player.hirePlayer')}</b>
          <p>${t('player.hirePlayerDesc')}</p>
          <button class="hire-btn btn btn-success">
            ${t('player.hireBtn', { playerName: this.player.name })}
          </button>
        </div>
        <div class="mb-4">
          <b><i class="fa fa-calendar" aria-hidden="true"></i> ${t('player.history')}</b>
          ${this.history.map(_renderPlayerHistory).join('')}
          ${this.history.length === 0 ? `<p>${t('player.noHistory')}</p>` : ''}
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

  onMounted () {
    const root = el(this._elementQuery)
    const overlayCard = root.closest('.overlay')
    if (!overlayCard) return

    const titleEl = overlayCard.querySelector('.card-title')
    const subtitleEl = overlayCard.querySelector('.card-subtitle')

    if (titleEl) titleEl.textContent = this.player.name
    if (subtitleEl) {
      if (this.playersTeam) {
        subtitleEl.innerHTML = `<span class="text-info" style="cursor: pointer">${this.playersTeam.name}</span>`
        subtitleEl.querySelector('span').addEventListener('click', () => {
          goTo(`team?id=${this.playersTeam.id}`)
          this.overlay.remove()
        })
      } else {
        subtitleEl.innerHTML = `<span class="text-muted">${t('player.freePlayer')}</span>`
      }
    }
  }

  async _onTradeOffer () {
    try {
      const root = el(this._elementQuery)
      const price = Number(root.querySelector('.trade-price-input').value)
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
