import { server } from '../../lib/gateway.js'
import { showDialog } from '../../partials/dialog.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../util/currency.js'
import { renderTable } from '../../partials/table.js'
import { renderButton } from '../../partials/button.js'
import { setQueryParams } from '../../lib/router.js'
import { sortByPosition } from '../../util/player.js'

export async function renderMarket () {
  const { team } = await server.getMyTeam()
  let { offers, players, teams } = await server.getOffers()
  offers = offers.filter(o => o.type === 'sell' && o.from_team_id !== team.id)
  console.log('Render market...')

  const table = renderTable({
    data: offers,
    cols: _prepareTableCols(players),
    renderRow: offer => {
      const player = players.find(p => p.id === offer.player_id)
      const team = teams.find(t => t.id === offer.from_team_id)
      return [
        player.name,
        team.name,
        player.position,
        player.level,
        euroFormat.format(offer.offer_value),
        renderButton('Buy', () => _showBuyDialog(player), 'primary')
      ]
    }
  })

  return `
    <h2>Transfer market</h2>
    <p>Have a look on the transfer market to catch better players:</p>
    ${table}
  `
}

function _prepareTableCols (players) {
  return [{
    name: 'Name',
    onClick (offer) {
      setQueryParams({ player_id: offer.player_id })
    }
  }, {
    name: 'Team',
    largeScreenOnly: true
  }, {
    name: 'Position',
    sortFn (offerA, offerB, isAsc) {
      const playerA = players.find(p => p.id === offerA.player_id)
      const playerB = players.find(p => p.id === offerB.player_id)
      if (isAsc) {
        return sortByPosition(playerB, playerA)
      }
      return sortByPosition(playerA, playerB)
    }
  }, {
    name: 'Level',
    largeScreenOnly: true,
    sortFn (offerA, offerB, isAsc) {
      const playerA = players.find(p => p.id === offerA.player_id)
      const playerB = players.find(p => p.id === offerB.player_id)
      if (!isAsc) {
        return playerA.level - playerB.level
      }
      return playerB.level - playerA.level
    },
    align: 'right'
  }, {
    name: 'Price',
    align: 'right',
    sortKey: 'offer_value'
  }, {
    name: '',
    largeScreenOnly: true
  }]
}

/**
 * @param {PlayerType} player
 * @returns {Promise<void>}
 * @private
 */
async function _showBuyDialog (player) {
  const { ok, value } = await showDialog({
    title: `Buy ${player.name}?`,
    text: 'Please enter the value of your offer to buy this player.',
    hasInput: true,
    inputType: 'number',
    inputLabel: 'Price',
    buttonText: 'Submit Offer'
  })
  if (!ok) return
  const price = Number(value)
  if (price <= 0) {
    toast('Please enter a valid price.', 'error')
    return
  }
  try {
    await server.addTradeOffer({
      player,
      price,
      type: 'buy'
    })
    toast('You\'ve sent a buy offer')
    // render('#page', await renderTradesPage())
    //
    // TODO: Call update here
    //
  } catch (e) {
    console.error(e)
    toast(e.message ?? 'Something went wrong', 'error')
  }
}
