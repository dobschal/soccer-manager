import { server } from '../lib/gateway.js'
import { sortByPosition } from '../util/player.js'
import { UIElement } from '../lib/UIElement.js'
import { PlayerListItem } from './playerListItem.js'

export class PlayerList extends UIElement {
  /**
   * @param {PlayerType[]} players
   * @param {boolean} showTitle
   * @param {(player: PlayerType) => void} onClickHandler
   */
  constructor (players, showTitle = true, onClickHandler) {
    super()
    this.players = players
    this.showTitle = showTitle
    this.onClickHandler = onClickHandler
  }

  onQueryChanged () {
    super.onQueryChanged()
  }

  get events () {
    return super.events
  }

  get template () {
    return `
      <div>
        <h3 class="${this.showTitle ? '' : 'hidden'}" style="clear: both;">Players (${this.players.length})</h3>
        <table class="table table-hover">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Pos</th>
              <th scope="col" class="text-right d-none d-sm-table-cell">Age</th>
              <th scope="col" class="text-right">Fit</th>
              <th scope="col" class="text-right">Lvl</th>
              <th scope="col" class="text-right d-none d-md-table-cell">Sallary</th>
            </tr>
          </thead>
          <tbody>
              ${this.players.map(player => new PlayerListItem(player, this.season, this.onClickHandler)).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  async load () {
    const { season } = await server.getCurrentGameday()
    this.season = season
    this.players.sort(sortByPosition)
  }
}
