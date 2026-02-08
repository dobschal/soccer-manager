import { UIElement } from '../lib/UIElement.js'
import { toast } from './toast.js'
import { server } from '../lib/gateway.js'
import { render } from '../lib/render.js'
import { showOverlay } from './overlay.js'
import { PlayerList } from './playerList.js'
import { renderPlayerImage } from './playerImage.js'
import { getPositionsOfFormation } from '../util/formation.js'

export const lineUpData = {
  squadDataChanged: false,
  parentInstance: null
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
    this.players = players
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
            this._overlay = showOverlay(
              'Select player',
              '',
              `${new PlayerList(
                this.players.filter(p => p.position === player.position && !p.fake),
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
   * @param {MouseEvent} event
   * @returns {Promise<void>}
   */
  async _onSaveButtonClick (event) {
    if (!event.target.closest('button.btn-primary')) return
    try {
      if (this.players.some(p => p.fake && p.in_game_position)) {
        return toast('Your lineup is incomplete!')
      }
      const playersToSave = this.players.filter(p => !p.fake)
      await server.saveLineup(playersToSave, this.team.formation)
      toast('Saved lineup.', 'success')
      await lineUpData.parentInstance.load()
      lineUpData.parentInstance.update()
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="card">
        <div class="squad card-body">
          ${this.players.filter(p => p.in_game_position).map(p => this._renderSquadPlayer(p)).join('')}
        </div>
        ${this._renderSaveButton()}
      </div>
    `
  }

  /**
   * @returns {void}
   */
  onMounted () {
    this._applyPositionHacks()
    this._loadPlayerImages()
    // Use event delegation for save button since it may not exist on initial mount
    const rootEl = document.querySelector(this._elementQuery)
    if (rootEl) {
      rootEl.addEventListener('click', this._onSaveButtonClick.bind(this))
    }
  }

  /**
   * @returns {void}
   */
  _applyPositionHacks () {
    // Position hack for 2x CM, 2x CD, 2x DM
    ['.player.CM', '.player.CD', '.player.DM'].forEach(positionClass => {
      const elements = document.querySelectorAll(`${this._elementQuery} ${positionClass}`)
      if (elements.length === 2) {
        elements.item(0).style.left = '38%'
        elements.item(1).style.left = '62%'
      }
      if (elements.length === 3) {
        elements.item(0).style.left = '38%'
        elements.item(1).style.left = '50%'
        elements.item(2).style.left = '62%'
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
  }

  /**
   * @param {PlayerType} player
   * @param {PlayerType} newPlayer
   * @returns {void}
   */
  _exchangePlayer (player, newPlayer) {
    const oldPosition = player.in_game_position
    player.in_game_position = newPlayer.in_game_position
    newPlayer.in_game_position = oldPosition
    this._overlay?.remove()
    if (player.id !== newPlayer.id) {
      lineUpData.squadDataChanged = true
    }
    render('#squad', renderLineup(this.players, this.team, lineUpData.parentInstance))
  }

  /**
   * @returns {string}
   */
  _renderSaveButton () {
    if (!lineUpData.squadDataChanged) return ''
    return `<button class="btn btn-primary w-100" type="button">Save</button>`
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

    return `
      <div class="player ${player.position}" data-player-id="${playerId}">
        <span class="position-badge ${player.position}">${player.position}</span>
        <span class="freshness-badge ${freshnessClass}">
            ${Math.floor(player.freshness * 100)}%
        </span>
        ${displayName}
        <span class="level-badge level-${player.level}">${player.level}</span>
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
