import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { euroFormat } from '../../lib/currency.js'
import { calculatePlayerAge } from '../../util/player.js'
import { goTo } from '../../lib/router.js'
import { t } from '../../i18n/index.js'

export class TradeHistoryPage extends UIElement {
  trades = []
  teams = []
  players = []

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      div: {
        click: (event) => {
          const target = event.target
          const teamLink = target.closest('[data-team-link]')
          if (teamLink) {
            goTo('team?id=' + teamLink.dataset.teamLink)
          }
        }
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <h2>${t('trades.tradeHistoryTitle')}</h2>
        <p>${t('trades.tradeHistoryDesc')}</p>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">${t('trades.player')}</th>
              <th scope="col" class="d-none d-sm-table-cell">${t('finances.from')}</th>
              <th scope="col" class="d-none d-sm-table-cell">${t('finances.to2')}</th>
              <th scope="col" class="text-right">${t('trades.price')}</th>
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
            <td><small class="table-divider-text">${t('results.gameDay', { day: trade.game_day + 1 })} (${t('finances.season', { season: trade.season + 1 })})</small></td>
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
          <td>${player?.name ?? 'Unknown'} (${player?.position ?? '?'}, ${player?.level ?? '?'}, ${player ? calculatePlayerAge(player, trade.season) : '?'})</td>
          <td class="d-none d-sm-table-cell"><span class="hover-text" data-team-link="${trade.from_team_id}">${fromTeam?.name ?? 'Unknown'}</span></td>
          <td class="d-none d-sm-table-cell"><span class="hover-text" data-team-link="${trade.to_team_id}">${toTeam?.name ?? 'Unknown'}</span></td>
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
