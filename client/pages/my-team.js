import { formatDate } from '../lib/date.js'
import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { render } from '../lib/render.js'
import { showOverlay } from '../partials/overlay.js'
import { toast } from '../partials/toast.js'

let data, overlay, dataChanged

export async function renderMyTeamPage () {
  dataChanged = false
  data = await server.getMyTeam()
  return `
    <div class="mb-4" id="header">
      ${_renderHeader()}
    </div>
    <h3>Lineup</h3>
    <div class="mb-4" id="squad">
      ${_renderSquad()}
    </div>
    <h3>Players</h3>
    <table class="table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Position</th>
          <th scope="col">Level</th>
        </tr>
      </thead>
      <tbody>
          ${data.players.sort(_sortByPosition).map(_renderPlayerListItem()).join('')}
      </tbody>
    </table>
  `
}

function _renderHeader () {
  return `
    <h2>${data.team.name}</h2>
    <p>
      <b>Coach</b>: ${data.user.username} since ${formatDate('DD. MMM YYYY', data.user.created_at)}<br>
      <b>Team Strength</b>: ${_calculateTeamStrength(data.players)}<br>
      <b>Formation</b>: ${data.team.formation}
    </p>
  `
}

function _calculateTeamStrength (players) {
  return players.filter(p => p.in_game_position).reduce((sum, player) => sum + player.level, 0)
}

/**
 * @param {Player} player
 */
function _renderPlayerListItem (onClickHandler) {
  return (player) => {
    const id = generateId()
    if (onClickHandler) {
      onClick('#' + id, () => onClickHandler(player))
    }
    return `
      <tr id="${id}" class="${player.in_game_position ? 'table-info' : 'table-warning'}">
        <th scope="row">${player.name}</th>
        <td>${player.position}</td>
        <td>${player.level}</td>
      </tr>
    `
  }
}

function _sortByPosition (playerA, playerB) {
  return _positionValue(playerB) - _positionValue(playerA)
}

/**
 * @param {Player} player
 * @returns {number}
 */
function _positionValue (player) {
  const playingValue = player.in_game_position ? 10 : 0
  if (player.position.endsWith('K')) return 3 + playingValue
  if (player.position.endsWith('D')) return 2 + playingValue
  if (player.position.endsWith('M')) return 1 + playingValue
  return playingValue
}

function _renderSquad () {
  // position hack for 2x CM and 2x CD
  setTimeout(() => {
    ['.CM', '.CD'].forEach(positionClass => {
      const el = document.querySelectorAll(positionClass)
      if (el.length === 2) {
        el.item(0).style.left = '38%'
        el.item(1).style.left = '62%'
      }
    })
  })
  return `
    <div class="squad">
      ${data.players.filter(p => p.in_game_position).map(_renderSquadPlayer).join('')}
    </div>
    ${_renderSaveButton()}
  `
}

function _renderSaveButton () {
  if (!dataChanged) return ''
  const id = generateId()
  onClick('#' + id, async () => {
    try {
      await server.saveLineup({ players: data.players })
      toast('Save lineup.')
      render('#page', await renderMyTeamPage())
    } catch (e) {
      console.error(e)
      toast('Something went wrong...')
    }
  })
  return `
    <button id="${id}" class="btn btn-primary" type="button">Save</button>
  `
}

function _renderSquadPlayer (player) {
  const id = generateId()
  onClick('#' + id, () => {
    overlay = showOverlay('Select player', '', `
      <table class="table table-hover">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Position</th>
            <th scope="col">Level</th>
          </tr>
        </thead>
        <tbody>
            ${data.players.filter(p => p.position === player.position).map(_renderPlayerListItem(newPlayer => _exchangePlayer(player, newPlayer))).join('')}
        </tbody>
      </table>
    `)

    // TODO: List item click exchnge player and save...
  })
  return `
    <div id="${id}" class="player ${player.position}">
      <span class="position-badge">${player.position}</span>
      ${player.name.split(' ')[0][0]}. ${player.name.split(' ')[1]}
      <span class="level-badge">${player.level}</span>
    </div>
  `
}

function _exchangePlayer (player, newPlayer) {
  const oldPosition = player.in_game_position
  player.in_game_position = newPlayer.in_game_position
  newPlayer.in_game_position = oldPosition
  overlay?.remove()
  if (player.id !== newPlayer) {
    dataChanged = true
  }
  render('#squad', _renderSquad())
  render('#header', _renderHeader())
}
