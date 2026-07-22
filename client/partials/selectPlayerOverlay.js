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
   * @param {PlayerType[]} [allPlayers] - All players the user could field for this slot
   *   (everyone in the squad minus suspended/injured/fake/already-on-pitch). When provided,
   *   the overlay shows a toggle that switches the list between matching-only and all players,
   *   letting the user field someone out of position (at reduced effectiveness).
   */
  constructor (currentPlayer, availablePlayers, onPlayerSelected, allPlayers) {
    super()
    this.currentPlayer = currentPlayer
    this.availablePlayers = availablePlayers
    this.onPlayerSelected = onPlayerSelected
    this.allPlayers = allPlayers ?? null
    this.showAll = false
    // The action-card section owns its own UIElement lifecycle. Player stat
    // updates (freshness/level after a card was applied) reach the rows and
    // the pitch tiles via the PLAYER_UPDATED server event — no callback
    // plumbing back through the overlay.
    this._actionCardGiver = new ActionCardGiver(currentPlayer)
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
        <div style="height: 280px">
            ${this._actionCardGiver}
        </div>
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
   * Update the cached PlayerList's data and trigger its own update(). Avoids
   * the placeholder dance from `${new PlayerList(...)}` in this.template.
   * Only called by the show-all toggle now — action-card driven stat changes
   * fan out via the PLAYER_UPDATED event straight to each PlayerListItem.
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
}
