import { UIElement } from '../lib/UIElement.js'
import { PlayerList } from './playerList.js'
import { t } from '../i18n/index.js'
import { el } from '../lib/html.js'
import { ActionCardGiver } from './actionCardGiver.js'

export class SelectPlayerOverlay extends UIElement {
  /**
   * @param {PlayerType} currentPlayer - Player currently in the slot (may be fake/empty)
   * @param {PlayerType[]} availablePlayers - Players whose natural position matches the slot
   * @param {(player: PlayerType) => void} onPlayerSelected - Called when a player from the list is clicked
   * @param {() => void} onActionCardApplied - Called after the action card finished applying
   * @param {PlayerType[]} [allPlayers] - All players the user could field for this slot
   *   (everyone in the squad minus suspended/injured/fake/already-on-pitch). When provided,
   *   the overlay shows a toggle that switches the list between matching-only and all players,
   *   letting the user field someone out of position (at reduced effectiveness).
   */
  constructor (currentPlayer, availablePlayers, onPlayerSelected, onActionCardApplied, allPlayers) {
    super()
    this.currentPlayer = currentPlayer
    this.availablePlayers = availablePlayers
    this.onPlayerSelected = onPlayerSelected
    this.onActionCardApplied = onActionCardApplied
    this.allPlayers = allPlayers ?? null
    this.showAll = false
    // The action-card section is its own UIElement so it can update in place
    // without re-rendering the overlay (which would flicker the player list).
    this._actionCardGiver = new ActionCardGiver(currentPlayer, () => this._refreshAfterActionCard())
  }

  /**
   * @returns {string}
   */
  get template () {
    // Cache the PlayerList instance: a fresh instance would render an async
    // placeholder via renderSync(), which made the overlay briefly empty (and
    // shrink on its `width: fit-content` card) when we called this.update()
    // after an action card. Reusing the instance lets us update it in place.
    if (!this._playerList) {
      this._playerList = new PlayerList(
        this._currentListPlayers(),
        false,
        (player) => this.onPlayerSelected?.(player),
        false,
        false,
        null,
        null,
        { useUrlSort: false }
      )
    }
    return `
      <div class="select-player-overlay">
        <p>${t('selectPlayer.subtitle')}</p>
        ${this._playerList}
        ${this._renderShowAllToggle()}
        ${this._actionCardGiver}
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '(optional)[data-toggle-show-all]': {
        click: async () => {
          this.showAll = !this.showAll
          this._refreshShowAllToggleDOM()
          await this._refreshPlayerListDOM()
        }
      }
    }
  }

  /**
   * @returns {PlayerType[]}
   */
  _currentListPlayers () {
    return this.showAll && this.allPlayers ? this.allPlayers : this.availablePlayers
  }

  /**
   * @returns {string}
   */
  _renderShowAllToggle () {
    if (!this.allPlayers) return ''
    const label = this.showAll ? t('selectPlayer.showMatchingOnly') : t('selectPlayer.showAllPlayers')
    const hint = this.showAll
      ? `<small class="text-muted d-block mt-2">${t('selectPlayer.outOfPositionHint')}</small>`
      : ''
    return `
      <div class="select-player-show-all mt-3">
        <button type="button" class="btn btn-outline-info w-100" data-toggle-show-all>
          <i class="fa fa-${this.showAll ? 'filter' : 'users'}" aria-hidden="true"></i>
          ${label}
        </button>
        ${hint}
      </div>
    `
  }

  /**
   * Called by the action-card section after a card was applied. Re-fetches the
   * roster (via the parent's onActionCardApplied) and re-points the overlay's
   * player references at the fresh objects so the list shows updated
   * freshness/level, then refreshes the list DOM in place.
   * @returns {Promise<void>}
   */
  async _refreshAfterActionCard () {
    const refreshed = await this.onActionCardApplied?.()
    if (refreshed?.players) {
      this._applyRefreshedPlayers(refreshed.players)
    }
    await this._refreshPlayerListDOM()
  }

  /**
   * Update the cached PlayerList's data and trigger its own update(). Avoids
   * the placeholder dance from `${new PlayerList(...)}` in this.template.
   * @returns {Promise<void>}
   */
  async _refreshPlayerListDOM () {
    if (!this._playerList) return
    this._playerList.players = this._currentListPlayers()
    if (this._playerList.isRendered) {
      await this._playerList.update()
    }
  }

  /**
   * Mutate the existing toggle button (and its hint) instead of re-rendering
   * the overlay. The button keeps its listener because the element itself is
   * not replaced.
   * @returns {void}
   */
  _refreshShowAllToggleDOM () {
    const toggleBtn = el(`${this._elementQuery} [data-toggle-show-all]`)
    if (!toggleBtn) return
    const label = this.showAll ? t('selectPlayer.showMatchingOnly') : t('selectPlayer.showAllPlayers')
    toggleBtn.innerHTML = `<i class="fa fa-${this.showAll ? 'filter' : 'users'}" aria-hidden="true"></i> ${label}`
    const wrapper = el(`${this._elementQuery} .select-player-show-all`)
    const existingHint = wrapper?.querySelector('small.text-muted')
    if (this.showAll && !existingHint) {
      toggleBtn.insertAdjacentHTML('afterend', `<small class="text-muted d-block mt-2">${t('selectPlayer.outOfPositionHint')}</small>`)
    } else if (!this.showAll && existingHint) {
      existingHint.remove()
    }
  }

  /**
   * @param {PlayerType[]} freshPlayers - Full team roster returned by the server
   */
  _applyRefreshedPlayers (freshPlayers) {
    const byId = new Map(freshPlayers.map(p => [p.id, p]))
    if (this.currentPlayer?.id != null) {
      this.currentPlayer = byId.get(this.currentPlayer.id) ?? this.currentPlayer
    }
    this.availablePlayers = this.availablePlayers.map(p => byId.get(p.id) ?? p)
    if (this.allPlayers) {
      this.allPlayers = this.allPlayers.map(p => byId.get(p.id) ?? p)
    }
  }
}
