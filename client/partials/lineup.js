import { UIElement } from '../lib/UIElement.js'
import { toast } from './toast.js'
import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { PlayerList } from './playerList.js'
import { renderPlayerImage } from './playerImage.js'
import { getPositionsOfFormation } from '../util/formation.js'
import { deepCopy } from '../lib/deepCopy.js'
import { renderLevelBadge } from './levelBadge.js'
import { fire } from '../lib/event.js'

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
    this.players = deepCopy(players)
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
            // Filter out suspended players from selection
            const availablePlayers = this.players.filter(p => p.position === player.position && !p.fake && !p.is_suspended && !p.is_injured)
            this._overlay = showOverlay(
              'Select player',
              '',
              `${new PlayerList(
                availablePlayers,
                false,
                newPlayer => this._exchangePlayer(player, newPlayer)
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
  }

  onUpdate () {
    this._applyPositionHacks()
    this._loadPlayerImages()
  }

  _overlay = null

  /**
   * @returns {void}
   */
  _fillEmptyPositions () {
    const positions = getPositionsOfFormation(this.team.formation)
    this.players.filter(p => p.in_game_position).forEach(p => {
      const index = positions.findIndex(po => p.position === po)
      if (index === -1) return console.error('A player has a in game position that is not in formation!')
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
        .map(p => ({ playerId: p.id, benchPosition: p.bench_position }))
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

    return `
      <div class="player ${player.position}" data-player-id="${playerId}" style="${unavailableStyle}">
        <span class="position-badge ${player.position}">${player.position}</span>
        <span class="freshness-badge ${freshnessClass}">
            ${player.fake ? '-' : Math.floor(player.freshness * 100) + '%'}
        </span>
        <span class="name">${isSuspended ? '🚫 ' : ''}${isInjured ? '<i class="fa fa-medkit"></i> ' : ''}${displayName}</span>
        ${renderLevelBadge(player.level, { size: 'lg' })}
      </div>
    `
  }

}

