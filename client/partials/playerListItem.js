import { UIElement } from '../lib/UIElement.js'
import { calculatePlayerAge, sallaryPerLevel } from '../util/player.js'
import { euroFormat } from '../util/currency.js'

export class PlayerListItem extends UIElement {
  get events () {
    return {
      '': {
        click: this.onClickHandler
      }
    }
  }

  /**
   * @param {PlayerType} player
   * @param {number} season
   * @param {(player: PlayerType) => void} onClickHandler
   */
  constructor (player, season, onClickHandler) {
    super()
    this.player = player
    this.season = season
    this.onClickHandler = () => onClickHandler(this.player)
  }

  get template () {
    return `
      <tr class="${this.player.in_game_position ? 'table-info' : 'table-warning'}">
        <th scope="row">${this.player.name}</th>
        <td>${this.player.position}</td>
        <td class="text-right d-none d-sm-table-cell">${calculatePlayerAge(this.player, this.season)}</td>
        <td class="text-right ${this.player.freshness < 0.4 ? 'text-danger' : (this.player.freshness < 0.7 ? 'text-warning' : 'text-success')}">${Math.floor(this.player.freshness * 100)}%</td>
        <td class="text-right"><span class="circle level-${this.player.level}">${this.player.level}</span></td>
        <td class="text-right d-none d-md-table-cell">${euroFormat.format(sallaryPerLevel[this.player.level])}</td>
      </tr>
    `
  }

  async load () {}
  async onQueryChanged () {}
}
