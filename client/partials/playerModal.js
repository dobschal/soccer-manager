import { showOverlay } from './overlay.js'
import { server } from '../lib/gateway.js'
import { calculatePlayerAge, sallaryPerLevel } from '../util/player.js'
import { euroFormat } from '../lib/currency.js'
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
  const buttonId = generateId()
  const inputId = generateId()
  const playerImage = await renderPlayerImage(player, myTeam)
  const { team: playersTeam } = await server.getTeam(player.team_id)
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

  onClick(teamLinkId, () => {
    goTo(`team?id=${playersTeam.id}`)
    overlay.remove()
  })

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
  const statCardStyle = 'background: linear-gradient(136deg, #1a1a2e 0%, #16213e 50%, #0d4a5a 100%); border-radius: 12px; width: 108px; height: 108px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white;'

  const overlay = showOverlay(
    player.name,
    `<span id="${teamLinkId}" class="text-info" style="cursor: pointer">${playersTeam.name}</span>`,
    `
      <div class="d-flex gap-3 mb-4">
        <div style="flex-shrink: 0;">${playerImage}</div>
        <div class="d-flex flex-column justify-content-center">
          <div class="d-flex flex-wrap gap-2">
            <div style="${statCardStyle}">
              <div style="font-size: 14px; opacity: 0.7;">Position</div>
              <div style="font-size: 28px; font-weight: bold;">${player.position}</div>
            </div>
            <div style="${statCardStyle}">
              <div style="font-size: 14px; text-transform: uppercase; opacity: 0.7;">Age</div>
              <div style="font-size: 28px; font-weight: bold;">${calculatePlayerAge(player, season)}</div>
            </div>
            <div style="${statCardStyle}">
              <div style="font-size: 14px; text-transform: uppercase; opacity: 0.7;">Level</div>
              <div style="font-size: 28px; font-weight: bold; color: ${levelColor.text}; text-shadow: 0 0 8px ${levelColor.text};">${player.level}</div>
            </div>            
            <div style="${statCardStyle}">
              <div style="font-size: 14px; text-transform: uppercase; opacity: 0.7;">Freshness</div>
              <div style="font-size: 28px; font-weight: bold; color: ${freshnessColor}">${Math.floor(player.freshness * 100)}%</div>
            </div>
            <div style="${statCardStyle}">
              <div style="font-size: 14px; text-transform: uppercase; opacity: 0.7;">Salary</div>
              <div style="font-size: 28px; font-weight: bold;">${formatCompactCurrency(sallaryPerLevel[player.level])}</div>
            </div>
            <div style="${statCardStyle}">
              <div style="font-size: 14px; text-transform: uppercase; opacity: 0.7;">Value</div>
              <div style="font-size: 28px; font-weight: bold;">${formatCompactCurrency(price)}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="${offer ? 'hidden' : ''} mb-4" style="clear: both">
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
              ${isMyPlayer ? 'Sell' : 'Buy'}
            </button>
          </div>
        </div>
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
    return `<div>${prefix} Moved to new club: ${team.name}</div>`
  }
  return '<div>unknown</div>'
})
