import { UIElement } from '../lib/UIElement.js'
import { renderPlayerImage } from './playerImage.js'
import { renderLevelBadge } from './levelBadge.js'
import { renderPositionBadge } from './positionBadge.js'
import { getPositionPenalty, getPositionLevelFactor } from '../util/player.js'
import { SERVER_EVENTS } from '../lib/serverEvents.js'
import { t } from '../i18n/index.js'
import { el } from '../lib/html.js'

const CARD_IMAGE_SIZE = 104

/**
 * Horizontally scrollable strip of player cards, each showing the same figure
 * the lineup pitch uses (`renderPlayerImage`) plus position / level / freshness
 * badges. Clicking a card selects that player.
 *
 * Players whose natural position doesn't match the target slot are listed after
 * the matching ones, separated by a wider gap and rendered dimmed (66% opacity)
 * with their concrete position malus, so picking someone out of position stays
 * possible but is visibly the second-best option. The player currently standing
 * in the slot is part of the strip too, highlighted in the info colour.
 */
export class PlayerPicker extends UIElement {
  /**
   * @param {PlayerType[]} players - Selectable players (any position).
   * @param {string} slot - Lineup slot being filled, e.g. 'CD'.
   * @param {TeamType|null} team - Used for shirt colour / emblem of the figures.
   * @param {(player: PlayerType) => void} onPlayerSelected
   * @param {number|null} [currentPlayerId] - Id of the player already in the slot,
   *   whose card is highlighted instead of dimmed.
   */
  constructor (players, slot, team, onPlayerSelected, currentPlayerId = null) {
    super()
    this.players = players ?? []
    this.slot = slot
    this.team = team ?? null
    this.onPlayerSelected = onPlayerSelected
    this.currentPlayerId = currentPlayerId ?? null
  }

  /**
   * @returns {string}
   */
  get template () {
    const players = this.sortedPlayers()
    if (players.length === 0) {
      return `
        <div class="player-picker player-picker--empty">
          <p class="text-muted mb-0">${t('selectPlayer.noPlayers')}</p>
        </div>
      `
    }
    // The first out-of-position card opens the second group and carries the
    // separating gap.
    const groupStartIndex = players.findIndex(player => player.position !== this.slot)
    return `
      <div class="player-picker">
        <div class="player-picker__track">
          ${players.map((player, index) => this._renderCard(player, index === groupStartIndex && index > 0)).join('')}
        </div>
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.player-picker': {
        click: (event) => {
          const cardEl = event.target.closest('.player-picker__card')
          if (!cardEl) return
          const player = this.players.find(p => p.id === Number(cardEl.dataset.playerId))
          if (!player) return
          this.onPlayerSelected?.(player)
        }
      }
    }
  }

  /**
   * An action card applied from the overlay changes level / freshness / star
   * status. Patch just the affected card instead of re-rendering the strip,
   * which would drop the scroll position and reload every figure.
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      [SERVER_EVENTS.PLAYER_UPDATED.name]: (data) => {
        if (!data?.player) return
        const player = this.players.find(p => p.id === data.player.id)
        if (!player) return
        Object.assign(player, data.player)
        this._refreshCard(player)
      }
    }
  }

  onMounted () {
    this._loadImages()
  }

  onUpdate () {
    this._loadImages()
  }

  /**
   * Matching players first (best level first), then the out-of-position ones
   * ranked by the level they would actually play at.
   * @returns {PlayerType[]}
   */
  sortedPlayers () {
    return [...this.players].sort((a, b) => {
      const aMatches = a.position === this.slot
      const bMatches = b.position === this.slot
      if (aMatches !== bMatches) return aMatches ? -1 : 1
      return this._effectiveLevel(b) - this._effectiveLevel(a)
    })
  }

  /**
   * @param {PlayerType} player
   * @returns {number}
   * @private
   */
  _effectiveLevel (player) {
    return player.level * getPositionLevelFactor(player.position, this.slot)
  }

  /**
   * @param {PlayerType} player
   * @param {boolean} [isGroupStart] - First card of the out-of-position group.
   * @returns {string}
   * @private
   */
  _renderCard (player, isGroupStart = false) {
    const isOutOfPosition = player.position !== this.slot
    const classes = [
      'player-picker__card',
      isOutOfPosition ? 'is-out-of-position' : '',
      player.id === this.currentPlayerId ? 'is-current' : '',
      isGroupStart ? 'is-group-start' : '',
      player.is_star_player ? 'is-star' : ''
    ].filter(Boolean).join(' ')
    return `
      <div class="${classes}" data-player-id="${player.id}" role="button" tabindex="0"
           title="${player.name}">
        ${this._renderCardInner(player)}
      </div>
    `
  }

  /**
   * Inner markup of a card — kept separate so `_refreshCard` can replace it in
   * place without touching the card element (and its `data-player-id`).
   * @param {PlayerType} player
   * @returns {string}
   * @private
   */
  _renderCardInner (player) {
    const isOutOfPosition = player.position !== this.slot
    const penalty = isOutOfPosition ? getPositionPenalty(player.position, this.slot) : 0
    const freshnessPercentage = Math.round(player.freshness * 100)
    return `
      <div class="player-picker__image"></div>
      <div class="player-picker__badges">
        ${renderPositionBadge(player.position, { outOfPosition: isOutOfPosition })}
        ${renderLevelBadge(player.level)}
      </div>
      <span class="player-picker__name">${this._displayName(player)}</span>
      <span class="player-picker__meta">
        <span class="${this._freshnessClass(freshnessPercentage)}">${freshnessPercentage}%</span>
        ${penalty > 0
    ? `<span class="player-picker__penalty" title="${t('myTeam.positionPenaltyHint', { position: player.position })}">-${Math.round(penalty * 100)}%</span>`
    : ''}
      </span>
    `
  }

  /**
   * Same abbreviation the pitch tiles use: first initial + last name.
   * @param {PlayerType} player
   * @returns {string}
   * @private
   */
  _displayName (player) {
    if (!player.name?.includes(' ')) return player.name ?? ''
    const parts = player.name.split(' ')
    return `${parts[0][0]} ${parts[1] ?? ''}`
  }

  /**
   * @param {number} freshnessPercentage
   * @returns {string}
   * @private
   */
  _freshnessClass (freshnessPercentage) {
    if (freshnessPercentage >= 80) return 'freshness-success'
    if (freshnessPercentage >= 60) return 'freshness-warning'
    if (freshnessPercentage >= 40) return 'freshness-orange'
    return 'freshness-danger'
  }

  /**
   * @param {PlayerType} player
   * @returns {void}
   * @private
   */
  _refreshCard (player) {
    const cardEl = el(`${this._elementQuery} .player-picker__card[data-player-id="${player.id}"]`)
    if (!cardEl) return
    cardEl.classList.toggle('is-star', Boolean(player.is_star_player))
    cardEl.innerHTML = this._renderCardInner(player)
    this._loadImage(player)
  }

  /**
   * @returns {void}
   * @private
   */
  _loadImages () {
    this.players.forEach(player => this._loadImage(player))
  }

  /**
   * @param {PlayerType} player
   * @returns {void}
   * @private
   */
  _loadImage (player) {
    renderPlayerImage(player, this.team, CARD_IMAGE_SIZE).then(image => {
      const imageEl = el(`${this._elementQuery} .player-picker__card[data-player-id="${player.id}"] .player-picker__image`)
      if (!imageEl) return
      imageEl.innerHTML = image
    })
  }
}
