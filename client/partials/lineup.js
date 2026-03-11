import { UIElement } from '../lib/UIElement.js'
import { toast } from './toast.js'
import { server } from '../lib/gateway.js'
import { render } from '../lib/render.js'
import { showOverlay } from './overlay.js'
import { PlayerList } from './playerList.js'
import { renderPlayerImage } from './playerImage.js'
import { getPositionsOfFormation } from '../util/formation.js'
import { deepCopy } from '../lib/deepCopy.js'
import { renderLevelBadge } from './levelBadge.js'

export const lineUpData = {
  squadDataChanged: false,
  parentInstance: null,
  onExchange: null
}

export class Lineup extends UIElement {
  _overlay = null

  /**
   * @param {PlayerType[]} players
   * @param {TeamType} team
   * @param {UIElement} parentInstance
   */
  constructor (players, team, parentInstance) {
    super()
    this.players = deepCopy(players)
    this.team = team
    lineUpData.parentInstance = parentInstance
    this._fillEmptyPositions()
  }

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
            const availablePlayers = this.players.filter(p => p.position === player.position && !p.fake && !p.is_suspended)
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
      await server.saveLineup(playersToSave, this.team.formation)
      toast('Lineup saved.', 'success')
      lineUpData.squadDataChanged = false
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    const benchPlayers = this.players.filter(p => !p.in_game_position && !p.fake)
    return `
      <div class="lineup-container">
        <div class="card bg-dark lineup-pitch">
          <div class="squad card-body">
            ${this.players.filter(p => p.in_game_position).map(p => this._renderSquadPlayer(p)).join('')}
          </div>
        </div>
        <div class="bench">
          <h6 class="bench-title">Bench</h6>
          ${benchPlayers.length > 0
      ? benchPlayers.map(p => this._renderSquadPlayer(p)).join('')
      : '<span class="bench-empty">No bench players</span>'}
        </div>
      </div>
    `
  }

  /**
   * @returns {void}
   */
  onMounted () {
    this._applyPositionHacks()
    this._loadPlayerImages()
  }

  /**
   * @returns {void}
   */
  _applyPositionHacks () {
    // Position hack for 2x CM, 2x CD, 2x DM
    ['.player.CM', '.player.CD', '.player.DM'].forEach(positionClass => {
      const elements = document.querySelectorAll(`${this._elementQuery} .squad ${positionClass}`)
      if (elements.length === 2) {
        elements.item(0).style.left = '38%'
        elements.item(1).style.left = '62%'
      }
      if (elements.length === 3) {
        elements.item(0).style.left = '32%'
        elements.item(1).style.left = '50%'
        elements.item(2).style.left = '68%'
      }
    })
  }

  /**
   * @returns {void}
   */
  _loadPlayerImages () {
    this.players.filter(p => p.in_game_position).forEach((player) => {
      renderPlayerImage(player, this.team, 100).then(image => {
        const playerId = player.fake ? `fake-${player.in_game_position}` : player.id
        const playerEl = document.querySelector(`${this._elementQuery} .squad .player[data-player-id="${playerId}"]`)
        playerEl?.insertAdjacentHTML('afterbegin', image)
      })
    })
    // Load images for bench players
    this.players.filter(p => !p.in_game_position && !p.fake).forEach((player) => {
      renderPlayerImage(player, this.team, 80).then(image => {
        const playerEl = document.querySelector(`${this._elementQuery} .bench .player[data-player-id="${player.id}"]`)
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
    if (player.id !== newPlayer.id) {
      lineUpData.squadDataChanged = true
    }
    render('#squad', renderLineup(this.players, this.team, lineUpData.parentInstance))
    if (lineUpData.onExchange) lineUpData.onExchange(this.players)
    await this._autoSaveIfComplete()
    setTimeout(() => {
      this._overlay?.remove()
    }, 300)
  }

  /**
   * @param {PlayerType} player
   * @returns {string}
   */
  _renderSquadPlayer (player) {
    const freshnessClass = player.freshness < 0.4 ? 'text-danger' : (player.freshness < 0.7 ? 'text-warning' : 'text-success')
    const displayName = player.name.includes(' ')
      ? player.name.split(' ')[0][0] + ' ' + (player.name.split(' ')[1] ?? '')
      : player.name
    // Use player ID for real players, or 'fake-{position}' for empty slots
    const playerId = player.fake ? `fake-${player.in_game_position}` : player.id
    const isSuspended = player.is_suspended
    const suspendedStyle = isSuspended ? 'opacity: 0.5; filter: grayscale(100%);' : ''

    return `
      <div class="player ${player.position}" data-player-id="${playerId}" style="${suspendedStyle}">
        <span class="position-badge ${player.position}">${player.position}</span>
        <span class="freshness-badge ${freshnessClass}">
            ${Math.floor(player.freshness * 100)}%
        </span>
        <span class="name">${isSuspended ? '🚫 ' : ''}${displayName}</span>
        ${renderLevelBadge(player.level, { size: 'lg' })}
      </div>
    `
  }

}

/**
 * Backwards compatibility wrapper
 * @param {PlayerType[]} players
 * @param {TeamType} team
 * @param {UIElement} parentInstance
 * @returns {string}
 */
export function renderLineup (players, team, parentInstance) {
  return new Lineup(players, team, parentInstance).toString()
}
