import { renderAsync } from '../../lib/renderAsync.js'
import { server } from '../../lib/gateway.js'
import { euroFormat } from '../../lib/currency.js'
import { calculatePlayerAge } from '../../util/player.js'
import { renderLink } from '../../partials/link.js'

export const renderTradeHistory = renderAsync(async (update) => {
  const { trades, teams, players } = await server.getTradeHistory()
  let season, gameDay
  const history = trades
    .map(trade => {
      let dividerRow = ''
      if (trade.season !== season || trade.game_day !== gameDay) {
        season = trade.season
        gameDay = trade.game_day
        dividerRow = `
        <tr>
            <td><small class="table-divider-text">Game Day: ${trade.game_day + 1} (${trade.season + 1})</small></td>
            <td class="d-none d-sm-table-cell"></td>
            <td class="d-none d-sm-table-cell"></td>
            <td></td>
        </tr>
      `
      }
      const player = players.find(p => p.id === trade.player_id)
      const fromTeam = teams.find(p => p.id === trade.from_team_id)
      const toTeam = teams.find(p => p.id === trade.to_team_id)
      return `
      ${dividerRow}
      <tr>
        <td>${player.name} (${player.position}, ${player.level}, ${calculatePlayerAge(player, trade.season)})</td>
        <td class="d-none d-sm-table-cell">${renderLink(fromTeam.name, 'team?id=' + trade.from_team_id)}</td>
        <td class="d-none d-sm-table-cell" >${renderLink(toTeam.name, 'team?id=' + trade.to_team_id)}</td>
        <td class="text-right">${euroFormat.format(trade.price)}</td>
      </tr>
    `
    })
    .join('')

  return `
    <h2>Trade History</h2>
    <p>Trades happened in the past:</p>
    <table class="table">
      <thead>
        <tr>
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
