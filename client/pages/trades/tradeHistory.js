import { updater } from '../../lib/updater.js'
import { server } from '../../lib/gateway.js'
import { euroFormat } from '../../util/currency.js'
import { calculatePlayerAge } from '../../util/player.js'

export const renderTradeHistory = updater(async (update) => {
  const { trades, teams, players } = await server.getTradeHistory()
  console.log('Got trades: ', trades, teams, players)

  const history = trades.map(trade => {
    const player = players.find(p => p.id === trade.player_id)
    const fromTeam = teams.find(p => p.id === trade.from_team_id)
    const toTeam = teams.find(p => p.id === trade.to_team_id)
    return `
      <tr>
        <td class="d-none d-sm-table-cell">${trade.season + 1}/${trade.game_day + 1}</td>
        <td>${player.name} (${player.position}, ${player.level}, ${calculatePlayerAge(player, trade.season)})</td>
        <td class="d-none d-sm-table-cell">${fromTeam.name}</td>
        <td class="d-none d-sm-table-cell">${toTeam.name}</td>
        <td class="text-right">${euroFormat.format(trade.price)}</td>
      </tr>
    `
  }).join('')

  return `
    <h2>Trade History</h2>
    <p>Trades happened in the past:</p>
    <table class="table">
      <thead>
        <tr>
          <th scope="col" class="d-none d-sm-table-cell"></th>
          <th scope="col">Player</th>
          <th scope="col" class="d-none d-sm-table-cell">From</th>
          <th scope="col" class="d-none d-sm-table-cell">To</th>
          <th scope="col" class="text-right">Price</th>
        </tr>
      </thead>
      <tbody>
        ${history}
      </tbody>
    </table>`
})
