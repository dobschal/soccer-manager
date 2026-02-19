import { UIElement } from '../lib/UIElement.js'
import { calculatePlayerAge, getSalary } from '../util/player.js'
import { euroFormat } from '../lib/currency.js'
import { renderLevelBadge } from './levelBadge.js'
import { calculateMarketValue } from '../pages/trades/marketValues.js'

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
   * @param {boolean} extended
   */
  constructor (player, season, onClickHandler, sellOfferPlayerIds = new Set(), extended = false) {
    super()
    this.player = player
    this.season = season
    this.onClickHandler = () => onClickHandler(this.player)
    this.sellOfferPlayerIds = sellOfferPlayerIds
    this.extended = extended
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
    const age = calculatePlayerAge(this.player, this.season)

    const salary = getSalary(this.player.level)
    let extendedCells = ''
    if (this.extended) {
      const value = calculateMarketValue(this.player.level, age)
      extendedCells = `
        <td class="text-right">${euroFormat.format(value)}</td>
        <td class="text-right">${this.player.season_goals ?? 0}</td>
        <td class="text-right">${this.player.season_games ?? 0}</td>
      `
    }

    return `
      <tr class="${rowClass}" data-player-id="${this.player.id}">
        <th scope="row">${this.player.name}${hasSellOffer ? ' 💰' : ''}${isSuspended ? ' 🚫' : ''} ${this._renderCards(yellowCards, redCards)}</th>
        <td>${this.player.position}</td>
        <td class="text-right">${age}</td>
        <td class="text-right ${this.player.freshness < 0.4 ? 'text-danger' : (this.player.freshness < 0.7 ? 'text-warning' : 'text-success')}">${Math.floor(this.player.freshness * 100)}%</td>
        <td class="text-right">${renderLevelBadge(this.player.level)}</td>
        <td class="text-right ${this.extended ? '' : 'd-none d-md-table-cell'}">${euroFormat.format(salary)}</td>
        ${extendedCells}
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
    return html
  }

}
