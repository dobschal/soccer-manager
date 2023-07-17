import { server } from '../lib/gateway.js'
import { getQueryParams } from '../lib/router.js'
import { toast } from '../partials/toast.js'

export async function renderTeamPage () {
  const { id } = getQueryParams()
  if (!id) toast('No team id present...')
  const info = await server.getTeam({ teamId: Number(id) })
  return `
    <div class="mb-4">
      <h2>${info.team.name}</h2>
      <p>
        <b>Team Strength</b>: ${_calculateTeamStrength(info.players)}
      </p>
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
