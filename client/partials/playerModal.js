import { showOverlay } from './overlay.js'
import { server } from '../lib/gateway.js'
import { calculatePlayerAge, sallaryPerLevel } from '../util/player.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { toast } from './toast.js'
import { renderButton } from './button.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { renderPlayerImage } from './playerImage.js'
import { showDialog } from './dialog.js'
import { renderAsync } from '../lib/renderAsync.js'
import { t } from '../i18n/index.js'

/**
 * Get color for player level (bronze/silver/gold)
 * @param {number} level
 * @returns {{ text: string }}
 */
function getLevelColor (level) {
  if (level >= 7) return { text: '#f0c75e' } // Gold
  if (level >= 4) return { text: '#d8d8d8' } // Silver
  return { text: '#daa06d' } // Bronze
}

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
 * @param {number} playerId
 * @returns {Promise<void>}
 */
export async function showPlayerModal (playerId) {
  const player = await server.getPlayerById(playerId)
  const { season } = await server.getCurrentGameday()
  const { team: myTeam } = await server.getMyTeam()
  const isMyPlayer = myTeam.id === player.team_id
  const isFreeAgent = !player.team_id
  const buttonId = generateId()
  const inputId = generateId()
  const hireButtonId = generateId()
  const playersTeam = player.team_id ? (await server.getTeam(player.team_id)).team : null
  // Render player with their team (or null for free agents to show grey shirt)
  const playerImage = await renderPlayerImage(player, playersTeam)
  const teamLinkId = generateId()
  const price = await server.estimateValue(player.id)
  const history = await server.getPlayerHistory(player.id)
  const { offer } = await server.myOfferForPlayer(player)
  const { offers } = await server.getOffers()
  const hasSellOffer = (offers || []).some(o => o.player_id === player.id && o.type === 'sell')
  console.log('Player modal - checking sell offers:', {
    playerId: player.id,
    offers,
    hasSellOffer
  })

  if (playersTeam) {
    onClick(teamLinkId, () => {
      goTo(`team?id=${playersTeam.id}`)
      overlay.remove()
    })
  }

  onClick(buttonId, async () => {
    try {
      const price = Number(el('#' + inputId).value)
      await server.addTradeOffer(player, price, isMyPlayer ? 'sell' : 'buy')
      toast(t('player.offerAdded', { playerName: player.name }), 'success')
      overlay.remove()
    } catch (e) {
      console.error(e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  })

  onClick(hireButtonId, async () => {
    try {
      const { ok } = await showDialog({
        title: t('player.hireConfirmTitle', { playerName: player.name }),
        text: t('player.hireConfirmText', { playerName: player.name, salary: sallaryPerLevel[player.level] }),
        hasInput: false,
        buttonText: t('player.yesHire'),
        buttonType: 'success'
      })
      if (!ok) return
      await server.givePlayerContract(player.id)
      toast(t('player.contractGiven', { playerName: player.name }), 'success')
      overlay.remove()
      // Dispatch event so pages like FreePlayers can refresh
      window.dispatchEvent(new CustomEvent('player-hired', { detail: { playerId: player.id } }))
    } catch (e) {
      console.error(e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  })

  const fireButton = renderButton(t('player.fireBtn'), async () => {
    try {
      const { ok } = await showDialog({
        title: t('player.fireConfirmTitle'),
        text: t('player.fireConfirmText', { playerName: player.name }),
        hasInput: false,
        buttonText: t('player.yesFire')
      })
      if (!ok) return
      await server.firePlayer(player)
      toast(t('player.playerFired'))
      overlay.remove()
      goTo('my-team')
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }, 'danger')

  const levelColor = getLevelColor(player.level)
  const freshnessColor = getFreshnessColor(player.freshness)

  const overlay = showOverlay(
    player.name,
    playersTeam
      ? `<span id="${teamLinkId}" class="text-info" style="cursor: pointer">${playersTeam.name}</span>`
      : `<span class="text-muted">${t('player.freePlayer')}</span>`,
    `
      <div class="d-flex flex-column flex-sm-row align-items-center align-items-sm-start gap-3 mb-4">
        <div style="flex-shrink: 0;">${playerImage}</div>
        <div class="d-flex flex-column justify-content-center">
          <div class="d-flex flex-wrap justify-content-center justify-content-sm-start gap-2">
            <div class="stat-card bg-dark">
              <div class="stat-card-label">${t('player.position')}</div>
              <div class="stat-card-value">${player.position}</div>
            </div>
            <div class="stat-card bg-dark">
              <div class="stat-card-label">${t('player.age')}</div>
              <div class="stat-card-value">${calculatePlayerAge(player, season)}</div>
            </div>
            <div class="stat-card bg-dark">
              <div class="stat-card-label">${t('player.level')}</div>
              <div class="stat-card-value" style="color: ${levelColor.text}; text-shadow: 0 0 8px ${levelColor.text};">${player.level}</div>
            </div>
            <div class="stat-card bg-dark">
              <div class="stat-card-label">${t('player.freshness')}</div>
              <div class="stat-card-value" style="color: ${freshnessColor}">${Math.floor(player.freshness * 100)}%</div>
            </div>
            <div class="stat-card bg-dark">
              <div class="stat-card-label">${t('player.salary')}</div>
              <div class="stat-card-value">${formatCompactCurrency(sallaryPerLevel[player.level])}</div>
            </div>
            <div class="stat-card bg-dark">
              <div class="stat-card-label">${t('player.value')}</div>
              <div class="stat-card-value">${formatCompactCurrency(price)}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="${isFreeAgent ? 'hidden' : ''} ${offer ? 'hidden' : ''} mb-4" style="clear: both">
        <b>💰 ${isMyPlayer ? t('player.sellPlayer') : t('player.buyPlayer')}</b>
        <p>${t('player.enterPrice')}</p>
        <div class="input-group mb-3">
          <input type="number"
                 id="${inputId}"
                 class="form-control"
                 placeholder="${t('player.pricePlaceholder')}"
                 aria-label="${t('player.pricePlaceholder')}"
                 aria-describedby="Yeah">
          <div class="input-group-append">
            <button id="${buttonId}"  class="btn btn-outline-primary" type="button">
              ${isMyPlayer ? t('player.sell') : t('player.submitOffer')}
            </button>
          </div>
        </div>
      </div>
      <div class="${isFreeAgent ? '' : 'hidden'} mb-4" style="clear: both">
        <b>🤝 ${t('player.hirePlayer')}</b>
        <p>${t('player.hirePlayerDesc')}</p>
        <button id="${hireButtonId}" class="btn btn-success">
          ${t('player.hireBtn', { playerName: player.name })}
        </button>
      </div>
      <div class="mb-4">
        <b><i class="fa fa-calendar" aria-hidden="true"></i> ${t('player.history')}</b>
        ${history.map(_renderPlayerHistory).join('')}
        ${history.length === 0 ? `<p>${t('player.noHistory')}</p>` : ''}
      </div>
      <div class="mb-4 ${hasSellOffer ? '' : 'hidden'}">
        💰 ${t('player.onMarket')} <a href="#trades">${t('trades.market')}</a>
      </div>
      <div class="${isMyPlayer ? '' : 'hidden'}">
        <b>${t('player.firePlayer')}</b>
        <p>${t('player.firePlayerDesc')}</p>
        ${fireButton}
      </div>
    `
  )
  overlay.onClose(() => {
    setQueryParams({
      player_id: null
    })
  })
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
