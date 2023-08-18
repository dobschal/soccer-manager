import { showOverlay } from './overlay.js'
import { server } from '../lib/gateway.js'
import { calculatePlayerAge, sallaryPerLevel } from '../util/player.js'
import { euroFormat } from '../util/currency.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { toast } from './toast.js'
import { renderButton } from './button.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { renderPlayerImage } from './playerImage.js'
import { showDialog } from './dialog.js'
import { renderAsync } from '../lib/renderAsync.js'

/**
 * @param {number} playerId
 * @returns {Promise<void>}
 */
export async function showPlayerModal (playerId) {
  const player = await server.getPlayerById_V2(playerId)
  const { season } = await server.getCurrentGameday()
  const { team: myTeam } = await server.getMyTeam()
  const isMyPlayer = myTeam.id === player.team_id
  const buttonId = generateId()
  const inputId = generateId()
  const playerImage = await renderPlayerImage(player, myTeam)
  const { team: playersTeam } = await server.getTeam({ teamId: player.team_id })
  const teamLinkId = generateId()
  const price = await server.estimateValue_V2(player.id)
  const history = await server.getPlayerHistory_V2(player.id)
  const { offer } = await server.myOfferForPlayer({ player })

  onClick(teamLinkId, () => {
    goTo(`team?id=${playersTeam.id}`)
    overlay.remove()
  })

  onClick(buttonId, async () => {
    try {
      const price = Number(el('#' + inputId).value)
      await server.addTradeOffer({
        player,
        price,
        type: isMyPlayer ? 'sell' : 'buy'
      })
      toast('You add a trade offer for ' + player.name)
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
      await server.firePlayer({ player })
      toast('You fired your player!')
      overlay.remove()
      goTo('my-team')
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }, 'danger')

  const overlay = showOverlay(
    player.name,
    `Position: ${player.position}`,
    `
      <p class="mb-4">
        ${playerImage}
        <b>Age</b>: ${calculatePlayerAge(player, season)}<br>
        <b>Level</b>: ${player.level}<br>
        <b>Freshness</b>: ${Math.floor(player.freshness * 100)}%<br>
        <b>Sallary</b>: ${euroFormat.format(sallaryPerLevel[player.level])}<br>
        <b>Value</b>: ${euroFormat.format(price)}<br>
        <b>Team</b>: <span id="${teamLinkId}" class="text-info">${playersTeam.name}</span>
      </p>
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
      <div class="mb-4 ${offer ? '' : 'hidden'}">
        This player is on the <a href="#trades">transfermarket</a>.
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
  if (item.type === 'LEVEL_UP') {
    return `<div>#${item.game_day} Player reached level ${item.value}</div>`
  } else if (item.type === 'TRANSFER') {
    const { team } = await server.getTeam({ teamId: Number(item.value) })
    return `<div>#${item.game_day} Moved to new club: ${team.name}</div>`
  }
  return '<div>unknown</div>'
})
