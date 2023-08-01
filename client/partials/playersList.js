import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { euroFormat } from '../util/currency.js'
import { calculatePlayerAge, sallaryPerLevel } from '../util/player.js'

let currentSeason

export async function renderPlayersList (players, showTitle = true, onClickHandler) {
  const { season } = await server.getCurrentGameday()
  currentSeason = season
  return `
    <h3 class="${showTitle ? '' : 'hidden'}">Players (${players.length})</h3>
    <table class="table table-hover">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Pos</th>
          <th scope="col" class="text-right d-none d-sm-table-cell">Age</th>
          <th scope="col" class="text-right">Fit</th>
          <th scope="col" class="text-right">Lvl</th>
          <th scope="col" class="text-right d-none d-md-table-cell">Sallary</th>
        </tr>
      </thead>
      <tbody>
          ${players.sort(_sortByPosition).map(renderPlayerListItem(onClickHandler)).join('')}
      </tbody>
    </table>
  `
}

export function renderPlayerListItem (onClickHandler) {
  return (player) => {
    if (player.fake) return ''
    const id = generateId()
    if (onClickHandler) {
      onClick('#' + id, () => onClickHandler(player))
    }
    return `
      <tr id="${id}" class="${player.in_game_position ? 'table-info' : 'table-warning'}">
        <th scope="row">${player.name}</th>
        <td>${player.position}</td>
        <td class="text-right d-none d-sm-table-cell">${calculatePlayerAge(player, currentSeason)}</td>
        <td class="text-right ${player.freshness < 0.4 ? 'text-danger' : (player.freshness < 0.7 ? 'text-warning' : 'text-success')}">${player.freshness * 100}%</td>
        <td class="text-right"><span class="circle level-${player.level}">${player.level}</span></td>
        <td class="text-right d-none d-md-table-cell">${euroFormat.format(sallaryPerLevel[player.level])}</td>
      </tr>
    `
  }
}

/**
 * @param {Player} playerA
 * @param {Player} playerB
 * @returns {number}
 */
export function _sortByPosition (playerA, playerB) {
  return _positionValue(playerB) - _positionValue(playerA)
}

/**
 * @param {Player} player
 * @returns {number}
 */
function _positionValue (player) {
  let playingValue = player.in_game_position ? 100 : 0
  if (player.position.startsWith('L')) playingValue += 3
  else if (player.position.startsWith('R')) playingValue += 1
  else playingValue += 2
  if (player.position.endsWith('K')) return 30 + playingValue
  if (player.position.endsWith('D')) return 20 + playingValue
  if (player.position.endsWith('M')) return 10 + playingValue
  return playingValue
}
