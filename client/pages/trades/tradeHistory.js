import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { euroFormat } from '../../lib/currency.js'
import { calculatePlayerAge } from '../../util/player.js'
import { Link } from '../../partials/link.js'

export class TradeHistoryPage extends UIElement {
  trades = []
  teams = []
  players = []

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
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
            ${this._renderTradeHistory()}
          </tbody>
        </table>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const response = await server.getTradeHistory()
    this.trades = response.trades
    this.teams = response.teams
    this.players = response.players
  }

  /**
   * @returns {string}
   */
  _renderTradeHistory () {
    let currentSeason = null
    let currentGameDay = null

    return this.trades.map(trade => {
      let dividerRow = ''
      if (trade.season !== currentSeason || trade.game_day !== currentGameDay) {
        currentSeason = trade.season
        currentGameDay = trade.game_day
        dividerRow = `
          <tr>
            <td><small class="table-divider-text">Game Day: ${trade.game_day + 1} (${trade.season + 1})</small></td>
            <td class="d-none d-sm-table-cell"></td>
            <td class="d-none d-sm-table-cell"></td>
            <td></td>
          </tr>
        `
      }

      const player = this.players.find(p => p.id === trade.player_id)
      const fromTeam = this.teams.find(t => t.id === trade.from_team_id)
      const toTeam = this.teams.find(t => t.id === trade.to_team_id)

      return `
        ${dividerRow}
        <tr>
          <td>${player.name} (${player.position}, ${player.level}, ${calculatePlayerAge(player, trade.season)})</td>
          <td class="d-none d-sm-table-cell">${new Link(fromTeam.name, 'team?id=' + trade.from_team_id)}</td>
          <td class="d-none d-sm-table-cell">${new Link(toTeam.name, 'team?id=' + trade.to_team_id)}</td>
          <td class="text-right">${euroFormat.format(trade.price)}</td>
        </tr>
      `
    }).join('')
  }
}

/**
 * @returns {string}
 */
export function renderTradeHistory () {
  return new TradeHistoryPage().toString()
}
