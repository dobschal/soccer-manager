import { calculateMarketValue, calculatePlayerAge, getSalary, willRetireNextSeason } from '../util/player.js'
import { euroFormat } from '../lib/currency.js'
import { renderLevelBadge } from './levelBadge.js'
import { ProgressBar } from './progressBar.js'
import { renderPositionBadge } from './positionBadge.js'
import { t } from '../i18n/index.js'

export class PlayerListItem {
  /**
   * @param {PlayerType} player
   * @param {number} season
   * @param {Set<number>} sellOfferPlayerIds
   * @param {number|null} captainId
   */
  constructor (player, season, sellOfferPlayerIds = new Set(), captainId = null) {
    this.player = player
    this.season = season
    this.sellOfferPlayerIds = sellOfferPlayerIds
    this.captainId = captainId
  }

  /**
   * Standalone <tr> rendering, kept for direct usage (e.g. tests).
   * @returns {string}
   */
  get template () {
    const aligns = ['', '', 'text-right', 'text-right', 'text-right', 'text-right', 'text-right', 'text-right', 'text-right']
    const cells = this.cells
    const cellsHtml = cells.map((cell, i) => {
      if (i === 0) return `<th scope="row">${cell}</th>`
      return `<td class="${aligns[i]}">${cell}</td>`
    }).join('')
    return `<tr class="${this.rowClass}" data-player-id="${this.player.id}">${cellsHtml}</tr>`
  }
  /**
   * Row class to highlight suspended/injured/lineup/bench players.
   * @returns {string}
   */
  get rowClass () {
    const player = this.player
    if (player.is_suspended || player.is_injured) return 'table-danger'
    if (player.in_game_position) return 'table-info'
    if (player.bench_position) return 'table-warning'
    return ''
  }

  /**
   * Cell content for use as Table renderRow output.
   * @returns {Array<string>}
   */
  get cells () {
    const player = this.player
    const hasSellOffer = this.sellOfferPlayerIds.has(player.id)
    const isSuspended = player.is_suspended
    const isInjured = player.is_injured
    const yellowCards = player.yellow_cards || 0
    const redCards = player.red_cards || 0
    const isCaptain = this.captainId !== null && player.id === this.captainId
    const age = calculatePlayerAge(player, this.season)
    const salary = getSalary(player.level)
    const value = calculateMarketValue(player.level, age)
    const retiring = willRetireNextSeason(player, this.season)

    const nameCell = `${player.name}${isCaptain ? ' (C)' : ''}${player.is_star_player ? ' ⭐' : ''}${hasSellOffer ? ' 💰' : ''}${isSuspended ? ' 🚫' : ''}${isInjured ? ` <i class="fa fa-medkit text-danger" title="${player.injury_type || ''} (${player.injury_days_left || 0})"></i>` : ''}${retiring ? ` <span class="retirement-icon" title="${t('player.retiringNextSeason')}"><i class="fa fa-hourglass-end"></i></span>` : ''} ${this._renderCards(yellowCards, redCards)}`

    return [
      nameCell,
      renderPositionBadge(player.position),
      `${age}`,
      `${new ProgressBar(player.freshness)}`,
      renderLevelBadge(player.level),
      euroFormat.format(salary),
      euroFormat.format(value),
      `${player.season_goals ?? 0}`,
      `${player.season_games ?? 0}`
    ]
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
