import { UIElement } from '../lib/UIElement.js'
import { calculatePlayerAge, getSalary } from '../util/player.js'
import { euroFormat } from '../lib/currency.js'
import { renderLevelBadge } from './levelBadge.js'
import { calculateMarketValue } from '../util/player.js'
import { ProgressBar } from './progressBar.js'
import { renderPositionBadge } from './positionBadge.js'

export class PlayerListItem extends UIElement {
  /**
   * @param {PlayerType} player
   * @param {number} season
   * @param {(player: PlayerType) => void} onClickHandler
   * @param {Set<number>} sellOfferPlayerIds
   * @param {boolean} extended
   * @param {number|null} captainId
   */
  constructor (player, season, onClickHandler, sellOfferPlayerIds = new Set(), extended = false, captainId = null) {
    super()
    this.player = player
    this.season = season
    this.onClickHandler = () => onClickHandler(this.player)
    this.sellOfferPlayerIds = sellOfferPlayerIds
    this.extended = extended
    this.captainId = captainId
  }
  /**
   * @returns {string}
   */
  get template () {
    const hasSellOffer = this.sellOfferPlayerIds.has(this.player.id)
    const isSuspended = this.player.is_suspended
    const yellowCards = this.player.yellow_cards || 0
    const redCards = this.player.red_cards || 0
    const isCaptain = this.captainId !== null && this.player.id === this.captainId
    const rowClass = isSuspended ? 'table-danger' : (this.player.in_game_position ? 'table-info' : 'table-warning')
    const age = calculatePlayerAge(this.player, this.season)

    const salary = getSalary(this.player.level)
    const value = calculateMarketValue(this.player.level, age)
    const hiddenClass = ''
    const extendedCells = `
      <td class="text-right ${hiddenClass}">${euroFormat.format(value)}</td>
      <td class="text-right ${hiddenClass}">${this.player.season_goals ?? 0}</td>
      <td class="text-right ${hiddenClass}">${this.player.season_games ?? 0}</td>
    `

    return `
      <tr class="${rowClass}" data-player-id="${this.player.id}">
        <th scope="row">${this.player.name}${isCaptain ? ' (C)' : ''}${this.player.is_star_player ? ' ⭐' : ''}${hasSellOffer ? ' 💰' : ''}${isSuspended ? ' 🚫' : ''} ${this._renderCards(yellowCards, redCards)}</th>
        <td>${renderPositionBadge(this.player.position)}</td>
        <td class="text-right">${age}</td>
        <td class="text-right">${new ProgressBar(this.player.freshness)}</td>
        <td class="text-right">${renderLevelBadge(this.player.level)}</td>
        <td class="text-right">${euroFormat.format(salary)}</td>
        ${extendedCells}
      </tr>
    `
  }
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
