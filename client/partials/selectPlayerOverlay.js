import {UIElement} from '../lib/UIElement.js'
import {PlayerPicker} from './playerPicker.js'
import {t} from '../i18n/index.js'
import {ActionCardGiver} from './actionCardGiver.js'

export class SelectPlayerOverlay extends UIElement {
  /**
   * @param {PlayerType} currentPlayer - Player currently in the slot (may be fake/empty)
   * @param {PlayerType[]} availablePlayers - Players whose natural position matches the slot
   * @param {(player: PlayerType) => void} onPlayerSelected - Called when a player from the strip is clicked
   * @param {PlayerType[]} [allPlayers] - All players the user could field for this slot
   *   (everyone in the squad minus suspended/injured/fake/already-on-pitch). Merged with
   *   `availablePlayers` and the current occupant into one strip: matching players first,
   *   the out-of-position ones after them and dimmed, so fielding someone out of position
   *   stays possible (at reduced effectiveness) without a second click.
   * @param {TeamType|null} [team] - Team the players belong to; drives shirt colour
   *   and emblem of the figures in the strip.
   */
  constructor (currentPlayer, availablePlayers, onPlayerSelected, allPlayers, team) {
    super()
    this.currentPlayer = currentPlayer
    this.availablePlayers = availablePlayers ?? []
    this.onPlayerSelected = onPlayerSelected
    this.allPlayers = allPlayers ?? null
    this.team = team ?? null
    // The action-card section owns its own UIElement lifecycle. Player stat
    // updates (freshness/level after a card was applied) reach the strip and
    // the pitch tiles via the PLAYER_UPDATED server event — no callback
    // plumbing back through the overlay.
    this._actionCardGiver = new ActionCardGiver(currentPlayer)
  }

  /**
   * @returns {string}
   */
  get template () {
    // Cache the PlayerPicker instance: a fresh instance would render an async
    // placeholder via renderSync(), which made the overlay briefly empty (and
    // shrink on its `width: fit-content` card) when we called this.update()
    // after an action card. Reusing the instance lets us update it in place.
    if (!this._playerPicker) {
      this._playerPicker = new PlayerPicker(
        this._selectablePlayers(),
        this.currentPlayer?.in_game_position,
        this.team,
        (player) => this.onPlayerSelected?.(player),
        this.currentPlayer?.fake ? null : this.currentPlayer?.id ?? null
      )
    }
    return `
      <div class="select-player-overlay">
        <p>${t('selectPlayer.subtitle')}</p>
        ${this._playerPicker}
        <div style="height: 292px">
            ${this._actionCardGiver}
        </div>
      </div>
    `
  }

  /**
   * Everyone shown in the strip: the player currently standing in the slot (so
   * the user sees who they are replacing), the matching players, and — when the
   * caller provided them — the rest of the squad. Deduplicated by id. An empty
   * slot contributes a fake placeholder, which is dropped.
   * @returns {PlayerType[]}
   */
  _selectablePlayers () {
    const byId = new Map()
    for (const player of [this.currentPlayer, ...this.availablePlayers, ...(this.allPlayers ?? [])]) {
      if (!player || player.fake) continue
      byId.set(player.id, player)
    }
    return [...byId.values()]
  }
}
