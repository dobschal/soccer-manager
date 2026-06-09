import { UIElement } from '../lib/UIElement.js'
import { toast } from './toast.js'
import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { SelectPlayerOverlay } from './selectPlayerOverlay.js'
import { renderPlayerImage } from './playerImage.js'
import { getPositionsOfFormation } from '../util/formation.js'
import { deepCopy } from '../lib/deepCopy.js'
import { renderLevelBadge } from './levelBadge.js'
import { fire } from '../lib/event.js'
import { t } from '../i18n/index.js'

export const lineUpData = {
  squadDataChanged: false
}

export class Lineup extends UIElement {
  /**
   * @param {PlayerType[]} players
   * @param {TeamType} team
   * @param {UIElement} parentInstance
   */
  constructor (players, team) {
    super()
    // Drop any fake placeholders that came in with the input. Lineup is often
    // re-rendered after firing 'lineup-exchange' with `this.players`, which
    // includes the fakes added by the previous _fillEmptyPositions run. If we
    // kept them, the new _fillEmptyPositions would race them against the real
    // players for slots — and depending on array order, a leftover fake could
    // claim a slot first and silently kick the real player into the reserves.
    this.players = deepCopy(players).filter(p => !p.fake)
    this.team = team
    this._fillEmptyPositions()
  }

  /**
   * @returns {string}
   */
  get template () {
    const lineupStrength = this.players
      .filter(p => p.in_game_position && !p.fake)
      .reduce((sum, p) => sum + p.level, 0)
    return `
      <div class="lineup-container">
        <div class="card bg-dark lineup-pitch">
          <div class="squad card-body">
            <span class="lineup-strength-overlay">${lineupStrength}</span>
            ${this.players.filter(p => p.in_game_position).map(p => this._renderSquadPlayer(p)).join('')}
          </div>
        </div>
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.squad': {
        click: (event) => {
          const playerEl = event.target.closest('.player')
          if (!playerEl) return

          const playerId = playerEl.dataset.playerId
          const player = playerId.startsWith('fake-')
            ? this.players.find(p => p.fake && p.in_game_position === playerId.replace('fake-', ''))
            : this.players.find(p => p.id === Number(playerId))

          if (player) {
            // Matching-position players excluding suspended/injured/fake
            const availablePlayers = this.players.filter(p => p.position === player.in_game_position && !p.fake && !p.is_suspended && !p.is_injured)
            // All players (any position) the user could field for this slot.
            // Excludes the player already in the slot, fake placeholders, and unavailable players.
            const allPlayers = this.players.filter(p => !p.fake && !p.is_suspended && !p.is_injured && p.id !== player.id)
            const positionTitle = t(`position.full.${player.in_game_position}`)
            this._overlay = showOverlay(
              positionTitle,
              '',
              `${new SelectPlayerOverlay(
                player,
                availablePlayers,
                newPlayer => this._exchangePlayer(player, newPlayer),
                () => this._refreshAfterActionCard(),
                allPlayers
              )}`
            )
          }
        }
      }
    }
  }

  onMounted () {
    this._applyPositionHacks()
    this._loadPlayerImages()
    void this._autoCleanupIfNeeded()
  }

  onUpdate () {
    this._applyPositionHacks()
    this._loadPlayerImages()
  }

  _overlay = null
  _needsAutoCleanup = false

  /**
   * Match each lineup player to a slot in the current formation. The slot only
   * needs to exist in the formation — playing out of natural position is
   * allowed (with the in-game level penalty), so we no longer require
   * `p.position === p.in_game_position`. Anything that can't be matched
   * (formation changed away from the slot, duplicate slot) gets cleared and
   * `_autoCleanupIfNeeded` persists the cleaned state.
   * @returns {void}
   */
  _fillEmptyPositions () {
    const positions = getPositionsOfFormation(this.team.formation)
    // Skip fakes — only real players claim slots. Constructor already strips
    // incoming fakes, this is a belt-and-suspenders guard.
    this.players.filter(p => p.in_game_position && !p.fake).forEach(p => {
      const index = positions.findIndex(po => po === p.in_game_position)
      if (index === -1) {
        p.in_game_position = ''
        this._needsAutoCleanup = true
        return
      }
      positions.splice(index, 1)
    })
    positions.forEach(position => {
      this.players.push({
        fake: true,
        in_game_position: position,
        position,
        level: 0,
        name: '-'
      })
    })
  }

  /**
   * If _fillEmptyPositions cleared invalid lineup assignments, persist the
   * cleaned lineup and let the parent component re-sync its player list.
   * @returns {Promise<void>}
   */
  async _autoCleanupIfNeeded () {
    if (!this._needsAutoCleanup) return
    this._needsAutoCleanup = false
    fire('lineup-exchange', this.players)
    await this._autoSaveIfComplete()
  }

  /**
   * @returns {boolean}
   */
  _allowedToSave () {
    const playersInLineup = this.players.filter(p => p.in_game_position && !p.fake)
    return playersInLineup.length > 0
  }

  /**
   * Auto-save the lineup if it's complete
   * @returns {Promise<void>}
   */
  async _autoSaveIfComplete () {
    if (!this._allowedToSave()) return

    try {
      const playersToSave = this.players.filter(p => !p.fake)
      const result = await server.saveLineup(playersToSave, this.team.formation)
      if (result.captainCleared) {
        this.team.captain_id = null
        fire('captain-cleared')
      }
      // Also save bench to persist any bench_position changes
      const benchData = playersToSave
        .filter(p => p.bench_position)
        .map(p => ({
          playerId: p.id,
          benchPosition: p.bench_position
        }))
      await server.saveBench(benchData)
      toast('Lineup saved.', 'success')
      lineUpData.squadDataChanged = false
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    }
  }

  /**
   * @returns {void}
   */
  _applyPositionHacks () {
    // Sets --lineup-offset so CSS can map it to `left` in portrait or `top` in landscape.
    ['.player.CM', '.player.CD', '.player.DM'].forEach(positionClass => {
      const elements = document.querySelectorAll(`${this._elementQuery} .squad ${positionClass}`)
      if (elements.length === 2) {
        elements.item(0).style.setProperty('--lineup-offset', '38%')
        elements.item(1).style.setProperty('--lineup-offset', '62%')
      }
      if (elements.length === 3) {
        elements.item(0).style.setProperty('--lineup-offset', '32%')
        elements.item(1).style.setProperty('--lineup-offset', '50%')
        elements.item(2).style.setProperty('--lineup-offset', '68%')
      }
    })
  }

  /**
   * @returns {void}
   */
  _loadPlayerImages () {
    const captainId = this.team.captain_id
    this.players.filter(p => p.in_game_position).forEach((player) => {
      const isCaptain = !player.fake && player.id === captainId
      renderPlayerImage(player, this.team, 100, { isCaptain }).then(image => {
        const playerId = player.fake ? `fake-${player.in_game_position}` : player.id
        const playerEl = document.querySelector(`${this._elementQuery} .squad .player[data-player-id="${playerId}"]`)
        playerEl?.insertAdjacentHTML('afterbegin', image)
      })
    })
  }

  /**
   * After an action card has been applied to a player from inside the overlay,
   * refetch the team so updated player stats (freshness/level) flow back into
   * the parent component and the lineup re-renders. The overlay stays open so
   * the user can apply additional cards to the same player.
   * @returns {Promise<void>}
   */
  async _refreshAfterActionCard () {
    try {
      const refreshedData = await server.getMyTeam()
      fire('lineup-exchange', refreshedData.players)
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    }
  }

  /**
   * @param {PlayerType} player
   * @param {PlayerType} newPlayer
   * @returns {void}
   */
  async _exchangePlayer (player, newPlayer) {
    const oldPosition = player.in_game_position
    player.in_game_position = newPlayer.in_game_position
    newPlayer.in_game_position = oldPosition
    // Remove from bench if the new player was on the bench
    if (newPlayer.bench_position) {
      newPlayer.bench_position = null
    }
    if (player.id !== newPlayer.id) {
      lineUpData.squadDataChanged = true
    }
    await this.update()
    fire('lineup-exchange', this.players)
    await this._autoSaveIfComplete()
    setTimeout(() => {
      this._overlay?.remove()
    }, 150)
  }

  /**
   * @param {PlayerType} player
   * @returns {string}
   */
  _renderSquadPlayer (player) {
    const freshnessPercentage = Math.round(player.freshness * 100)
    const freshnessClass = freshnessPercentage >= 80
      ? 'freshness-success'
      : freshnessPercentage >= 60
        ? 'freshness-warning'
        : freshnessPercentage >= 40
          ? 'freshness-orange'
          : 'freshness-danger'
    const displayName = player.name.includes(' ')
      ? player.name.split(' ')[0][0] + ' ' + (player.name.split(' ')[1] ?? '')
      : player.name
    // Use player ID for real players, or 'fake-{position}' for empty slots
    const playerId = player.fake ? `fake-${player.in_game_position}` : player.id
    const isSuspended = player.is_suspended
    const isInjured = player.is_injured
    const unavailableStyle = (isSuspended || isInjured) ? 'opacity: 0.5; filter: grayscale(100%);' : ''

    const isOutOfPosition = !player.fake && player.position !== player.in_game_position
    const badgeClass = `position-badge ${player.in_game_position}${isOutOfPosition ? ' is-wrong-position' : ''}`

    return `
      <div class="player ${player.in_game_position}" data-player-id="${playerId}" style="${unavailableStyle}">
        <span class="${badgeClass}">${player.in_game_position}</span>
        <span class="freshness-badge ${freshnessClass}">
            ${player.fake ? '-' : Math.floor(player.freshness * 100) + '%'}
        </span>
        <span class="name">${isSuspended ? '🚫 ' : ''}${isInjured ? '<i class="fa fa-medkit"></i> ' : ''}${displayName}</span>
        ${renderLevelBadge(player.level, { size: 'lg' })}
      </div>
    `
  }

}

