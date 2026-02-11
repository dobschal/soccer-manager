import { UIElement } from '../lib/UIElement.js'
import { calculatePlayerAge, sallaryPerLevel } from '../util/player.js'
import { euroFormat } from '../lib/currency.js'

export class PlayerListItem extends UIElement {
  /**
   * @returns {UIElementEvents}
   */
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
   * @param {Set<number>} sellOfferPlayerIds
   */
  constructor (player, season, onClickHandler, sellOfferPlayerIds = new Set()) {
    super()
    this.player = player
    this.season = season
    this.onClickHandler = () => onClickHandler(this.player)
    this.sellOfferPlayerIds = sellOfferPlayerIds
  }

  /**
   * @returns {string}
   */
  get template () {
    const hasSellOffer = this.sellOfferPlayerIds.has(this.player.id)
    const isSuspended = this.player.is_suspended
    const yellowCards = this.player.yellow_cards || 0
    const redCards = this.player.red_cards || 0
    const rowClass = isSuspended ? 'table-danger' : (this.player.in_game_position ? 'table-info' : 'table-warning')
    return `
      <tr class="${rowClass}">
        <th scope="row">${this.player.name}${hasSellOffer ? ' 💰' : ''}${isSuspended ? ' 🚫' : ''}</th>
        <td>${this.player.position}</td>
        <td class="text-right d-none d-sm-table-cell">${calculatePlayerAge(this.player, this.season)}</td>
        <td class="text-right ${this.player.freshness < 0.4 ? 'text-danger' : (this.player.freshness < 0.7 ? 'text-warning' : 'text-success')}">${Math.floor(this.player.freshness * 100)}%</td>
        <td class="text-right d-none d-sm-table-cell">${this._renderCards(yellowCards, redCards)}</td>
        <td class="text-right"><span class="circle level-${this.player.level}">${this.player.level}</span></td>
        <td class="text-right d-none d-md-table-cell">${euroFormat.format(sallaryPerLevel[this.player.level])}</td>
      </tr>
    `
  }

  /**
   * @param {number} yellowCards
   * @param {number} redCards
   * @returns {string}
   */
  _renderCards (yellowCards, redCards) {
    let html = ''
    if (redCards > 0) {
      html += `<span class="card-badge card-badge--red" title="Red card"></span>`
    }
    if (yellowCards > 0) {
      html += `<span class="card-badge card-badge--yellow" title="${yellowCards} yellow card(s)"><span class="card-badge__count">${yellowCards}</span></span>`
    }
    if (!html) {
      html = '-'
    }
    return html
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
  }

  /**
   * @returns {Promise<void>}
   */
  async onQueryChanged () {
  }
}
