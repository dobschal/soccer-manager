import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { toast } from './toast.js'
import { server } from '../lib/gateway.js'
import { render } from '../lib/render.js'
import { showOverlay } from './overlay.js'
import { renderPlayersList } from './playersList.js'
import { renderPlayerImage } from './playerImage.js'
import { renderMyTeamPage } from '../pages/my-team.js'
import { getPositionsOfFormation } from '../lib/formation.js'

export const lineUpData = {
  squadDataChanged: false
}
let overlay

/**
 * @param {PlayerType[]} players
 * @param {TeamType} team
 * @returns {string}
 */
export function renderLineup (players, team) {
  const positions = getPositionsOfFormation(team.formation)
  players.filter(p => p.in_game_position).forEach(p => {
    const index = positions.findIndex(po => p.position === po)
    if (index === -1) return console.error('A player has a in game position that is not in formation!')
    positions.splice(index, 1)
  })
  positions.forEach(position => {
    players.push({
      fake: true,
      in_game_position: position,
      position,
      level: 0,
      name: '-'
    })
  })
  // position hack for 2x CM and 2x CD
  setTimeout(() => {
    ['.player.CM', '.player.CD', '.player.DM'].forEach(positionClass => {
      const el = document.querySelectorAll(positionClass)
      if (el.length === 2) {
        el.item(0).style.left = '38%'
        el.item(1).style.left = '62%'
      }
      if (el.length === 3) {
        el.item(0).style.left = '38%'
        el.item(1).style.left = '50%'
        el.item(2).style.left = '62%'
      }
    })
  })
  return `
    <div class="squad">
      ${players.filter(p => p.in_game_position).map(_renderSquadPlayer(players, team)).join('')}
    </div>
    ${_renderSaveButton(players, team)}
  `
}

function _renderSaveButton (players, team) {
  if (!lineUpData.squadDataChanged) return ''
  const id = generateId()
  onClick('#' + id, async () => {
    try {
      if (players.some(p => p.fake && p.in_game_position)) {
        return toast('Your lineup is incomplete!')
      }
      players = players.filter(p => !p.fake)
      await server.saveLineup({ players, formation: team.formation })
      toast('Save lineup.')
      render('#page', await renderMyTeamPage())
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    }
  })
  return `
    <button id="${id}" class="btn btn-primary w-100" type="button">Save</button>
  `
}

function _renderSquadPlayer (players, team) {
  return (player) => {
    const id = generateId()
    onClick('#' + id, async () => {
      overlay = showOverlay(
        'Select player',
        '',
        `${await renderPlayersList(players.filter(p => p.position === player.position), false, newPlayer => _exchangePlayer(player, newPlayer, players, team))}`
      )
    })
    setTimeout(() => {
      renderPlayerImage(player, team, 100).then(image => {
        el(id)?.insertAdjacentHTML('afterbegin', image)
      })
    })
    return `
      <div id="${id}" class="player ${player.position}">
        <span class="position-badge ${player.position}">${player.position}</span>
        <span class="freshness-badge ${player.freshness < 0.4 ? 'text-danger' : (player.freshness < 0.7 ? 'text-warning' : 'text-success')}">
            ${Math.floor(player.freshness * 100)}%
        </span>
        ${player.name.includes(' ') ? player.name.split(' ')[0][0] + ' ' + (player.name.split(' ')[1] ?? '') : player.name}
        <span class="level-badge level-${player.level}">${player.level}</span>
      </div>
    `
  }
}

function _exchangePlayer (player, newPlayer, players, team) {
  const oldPosition = player.in_game_position
  player.in_game_position = newPlayer.in_game_position
  newPlayer.in_game_position = oldPosition
  overlay?.remove()
  if (player.id !== newPlayer) {
    lineUpData.squadDataChanged = true
  }
  render('#squad', renderLineup(players, team))
}
