import { formatDate } from '../lib/date.js'
import { server } from '../lib/gateway.js'

let info

export async function renderMyTeamPage () {
  info = await server.getMyTeam()
  console.log(info)
  return `
    <div class="mb-4">
      <h2>${info.team.name}</h2>
      <p>
        <b>Coach</b>: ${info.user.username} since ${formatDate('DD. MMM YYYY', info.user.created_at)}<br>
        <b>Team Strength</b>: ${_calculateTeamStrength(info.players)}<br>
        <b>Formation</b>: ${info.team.formation}
      </p>
    </div>
    ${_renderSquad(info.players)}
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
          ${info.players.sort(_sortByPosition).map(_renderPlayerListItem).join('')}
      </tbody>
    </table>
  `
}

function _calculateTeamStrength (players) {
  return players.filter(p => p.in_game_position).reduce((sum, player) => sum + player.level, 0)
}

/**
 * @param {Player} player
 */
function _renderPlayerListItem (player) {
  return `
    <tr class="${player.in_game_position ? 'table-info' : 'table-warning'}">
      <th scope="row">${player.name}</th>
      <td>${player.position}</td>
      <td>${player.level}</td>
    </tr>
  `
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

function _renderSquad (players) {
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
    <div class="mb-4 squad">
      ${players.filter(p => p.in_game_position).map(_renderSquadPlayer).join('')}
    </div>
  `
}

function _renderSquadPlayer (player) {
  return `
    <div class="player ${player.position}">
      ${player.name.split(' ')[0][0]}. ${player.name.split(' ')[1]}
    </div>
  `
}
