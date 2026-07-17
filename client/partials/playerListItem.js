import { calculateMarketValue, calculatePlayerAge, getSalary, willRetireNextSeason } from '../util/player.js'
import { euroFormat } from '../lib/currency.js'
import { renderLevelBadge } from './levelBadge.js'
import { ProgressBar } from './progressBar.js'
import { renderPositionBadge } from './positionBadge.js'
import { t } from '../i18n/index.js'
import { UIElement } from '../lib/UIElement.js'
import { SERVER_EVENTS } from '../lib/serverEvents.js'
import { server } from '../lib/gateway.js'

/**
 * A single row of `PlayerList`. Now owns its own `<tr>` DOM node so it can
 * subscribe to server events (e.g. NEW_SELL_TRADE_OFFER) and refresh itself
 * atomically without re-rendering the whole list.
 */
export class PlayerListItem extends UIElement {
  /**
   * @param {PlayerType} player
   * @param {number} season
   * @param {Set<number>} sellOfferPlayerIds - Shared with the parent PlayerList
   *   so a local mutation here (e.g. after a NEW_SELL_TRADE_OFFER for this
   *   player) is visible to the rest of the list too.
   * @param {number|null} captainId
   */
  constructor (player, season, sellOfferPlayerIds = new Set(), captainId = null) {
    super()
    this.player = player
    this.season = season
    this.sellOfferPlayerIds = sellOfferPlayerIds
    this.captainId = captainId
  }

  /**
   * Initial load is a no-op: the constructor gets a `player` object from the
   * parent PlayerList, which is authoritative at mount time. On update
   * (triggered by a server event), refetch the player fresh so any changed
   * fields (freshness, level, in_game_position, injuries, …) are picked up.
   * @param {boolean} isUpdate
   */
  async load (isUpdate) {
    if (!isUpdate) return
    const fresh = await server.getPlayerById(this.player.id)
    if (fresh) this.player = fresh
  }
  /**
   * The `<tr>` template rendered into the parent table's tbody.
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
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      // Fires for the selling team's user when they list a player. Payload
      // includes { playerId } so each row can filter down to its own player
      // and avoid a full-list refetch.
      [SERVER_EVENTS.NEW_SELL_TRADE_OFFER.name]: (data) => {
        if (!data || data.playerId !== this.player.id) return
        this.sellOfferPlayerIds.add(this.player.id)
        this.update()
      },
      // Fires when the user cancels a sell offer, or when the per-team limit
      // sweep removes one. Same payload shape as NEW_SELL_TRADE_OFFER.
      [SERVER_EVENTS.REMOVE_SELL_TRADE_OFFER.name]: (data) => {
        if (!data || data.playerId !== this.player.id) return
        if (!this.sellOfferPlayerIds.has(this.player.id)) return
        this.sellOfferPlayerIds.delete(this.player.id)
        this.update()
      }
    }
  }
  /**
   * The row shows a background-refresh pulse while `load(true)` is in flight
   * — better than the full bouncing-ball loader for a single table row.
   */
  updateIndicator = true

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
   * Cell content — still exposed for tests and for any legacy caller that
   * wants to render the cells inside its own `<tr>` wrapper.
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

    const injuryDays = player.injury_days_left || 0
    const cardsHtml = this._renderCards(yellowCards, redCards)
    const nameParts = [
      `<span class="player-name-cell__name">${player.name}${isCaptain ? ' (C)' : ''}</span>`,
      player.is_star_player ? '<span class="player-name-cell__icon">⭐</span>' : '',
      hasSellOffer ? '<span class="player-name-cell__icon">💰</span>' : '',
      isSuspended ? '<span class="player-name-cell__icon">🚫</span>' : '',
      isInjured ? `<span class="player-name-cell__icon injury-badge" title="${player.injury_type || ''}"><i class="fa fa-medkit text-danger"></i><span class="injury-badge__days">${injuryDays}</span></span>` : '',
      retiring ? `<span class="retirement-icon" title="${t('player.retiringNextSeason')}"><i class="fa fa-hourglass-end"></i></span>` : '',
      cardsHtml ? `<span class="player-name-cell__icon">${cardsHtml}</span>` : ''
    ].filter(Boolean).join('')
    const nameCell = `<span class="player-name-cell">${nameParts}</span>`

    // When a player is fielded out of their natural position, show the slot
    // they're actually playing in (with a red-ringed badge) followed by their
    // natural position as a dimmed hint, so the list matches the lineup while
    // still surfacing where the player really belongs.
    const displayPosition = player.in_game_position || player.position
    const isOutOfPosition = Boolean(player.in_game_position) && player.in_game_position !== player.position
    const positionBadge = renderPositionBadge(displayPosition, { outOfPosition: isOutOfPosition }) +
      (isOutOfPosition ? renderPositionBadge(player.position, { dimmed: true }) : '')

    return [
      nameCell,
      positionBadge,
      `${new ProgressBar(player.freshness)}`,
      renderLevelBadge(player.level),
      `${age}`,
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
