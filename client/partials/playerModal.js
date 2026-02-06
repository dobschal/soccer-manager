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
      toast('You added a trade offer for ' + player.name, 'success')
      overlay.remove()
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong', 'error')
    }
  })

  onClick(hireButtonId, async () => {
    try {
      const { ok } = await showDialog({
        title: `Hire ${player.name}?`,
        text: `Do you want to hire ${player.name} for your team? The salary would be ${sallaryPerLevel[player.level]}€ per game day.`,
        hasInput: false,
        buttonText: 'Yes, hire!',
        buttonType: 'success'
      })
      if (!ok) return
      await server.givePlayerContract(player.id)
      toast('You gave ' + player.name + ' a new contract.', 'success')
      overlay.remove()
      // Dispatch event so pages like FreePlayers can refresh
      window.dispatchEvent(new CustomEvent('player-hired', { detail: { playerId: player.id } }))
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong', 'error')
    }
  })

  const fireButton = renderButton('Fire Player', async () => {
    try {
      const { ok } = await showDialog({
        title: 'Fire player?',
        text: `Are you sure you want to fire ${player.name}?`,
        hasInput: false,
        buttonText: 'Yes, fire!'
      })
      if (!ok) return
      await server.firePlayer(player)
      toast('You fired your player!')
      overlay.remove()
      goTo('my-team')
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }, 'danger')

  const levelColor = getLevelColor(player.level)
  const freshnessColor = getFreshnessColor(player.freshness)

  const overlay = showOverlay(
    player.name,
    playersTeam
      ? `<span id="${teamLinkId}" class="text-info" style="cursor: pointer">${playersTeam.name}</span>`
      : '<span class="text-muted">Free player</span>',
    `
      <div class="d-flex flex-column flex-sm-row align-items-center align-items-sm-start gap-3 mb-4">
        <div style="flex-shrink: 0;">${playerImage}</div>
        <div class="d-flex flex-column justify-content-center">
          <div class="d-flex flex-wrap justify-content-center justify-content-sm-start gap-2">
            <div class="stat-card bg-dark">
              <div class="stat-card-label">Position</div>
              <div class="stat-card-value">${player.position}</div>
            </div>
            <div class="stat-card bg-dark">
              <div class="stat-card-label">Age</div>
              <div class="stat-card-value">${calculatePlayerAge(player, season)}</div>
            </div>
            <div class="stat-card bg-dark">
              <div class="stat-card-label">Level</div>
              <div class="stat-card-value" style="color: ${levelColor.text}; text-shadow: 0 0 8px ${levelColor.text};">${player.level}</div>
            </div>
            <div class="stat-card bg-dark">
              <div class="stat-card-label">Freshness</div>
              <div class="stat-card-value" style="color: ${freshnessColor}">${Math.floor(player.freshness * 100)}%</div>
            </div>
            <div class="stat-card bg-dark">
              <div class="stat-card-label">Salary</div>
              <div class="stat-card-value">${formatCompactCurrency(sallaryPerLevel[player.level])}</div>
            </div>
            <div class="stat-card bg-dark">
              <div class="stat-card-label">Value</div>
              <div class="stat-card-value">${formatCompactCurrency(price)}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="${isFreeAgent ? 'hidden' : ''} ${offer ? 'hidden' : ''} mb-4" style="clear: both">
        <b>💰 ${isMyPlayer ? 'Sell' : 'Buy'} Player?</b>
        <p>Just enter a wanted price:</p>
        <div class="input-group mb-3">
          <input type="number"
                 id="${inputId}"
                 class="form-control"
                 placeholder="Price"
                 aria-label="Price"
                 aria-describedby="Yeah">
          <div class="input-group-append">
            <button id="${buttonId}"  class="btn btn-outline-primary" type="button">
              ${isMyPlayer ? 'Sell' : 'Submit Offer'}
            </button>
          </div>
        </div>
      </div>
      <div class="${isFreeAgent ? '' : 'hidden'} mb-4" style="clear: both">
        <b>🤝 Hire Player?</b>
        <p>This player is a free agent. Hire them directly for your team:</p>
        <button id="${hireButtonId}" class="btn btn-success">
          Hire ${player.name}
        </button>
      </div>
      <div class="mb-4">
        <b><i class="fa fa-calendar" aria-hidden="true"></i> History</b>
        ${history.map(_renderPlayerHistory).join('')}
        ${history.length === 0 ? '<p>... no entry yet</p>' : ''}
      </div>
      <div class="mb-4 ${hasSellOffer ? '' : 'hidden'}">
        💰 This player is on the <a href="#trades">transfer market</a>.
      </div>
      <div class="${isMyPlayer ? '' : 'hidden'}">
        <b>Fire Player?</b>
        <p>The player would be fired immediately:</p>
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
    return `<div>${prefix} Player reached level ${item.value}</div>`
  } else if (item.type === 'TRANSFER') {
    const { team } = await server.getTeam(Number(item.value))
    return `<div>${prefix} Moved to new club: ${team?.name ?? 'Unknown'}</div>`
  } else if (item.type === 'FIRED') {
    return `<div>${prefix} Released by ${item.value}</div>`
  } else if (item.type === 'HIRED') {
    return `<div>${prefix} Signed with ${item.value}</div>`
  } else if (item.type === 'CHANGE_PLAYER_POSITION') {
    return `<div>${prefix} Changed position to ${item.value}</div>`
  }
  return `<div>${prefix} ${item.type}: ${item.value}</div>`
})
