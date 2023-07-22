import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'

let currentSeason

const euroFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR'
})

//
// TODO: Refactor that to have a shared util
//
export const sallaryPerLevel = [
  0,
  150, // level 1
  225,
  337,
  506,
  759, // level 5
  1139,
  1709,
  2562,
  3844,
  5767 // level 10
]
export async function renderPlayersList (players, showTitle = true, onClickHandler) {
  console.log('Players to render: ', players)
  const { season } = await server.getCurrentGameday()
  currentSeason = season
  return `
    <h3 class="${showTitle ? '' : 'hidden'}">Players (${players.length})</h3>
    <table class="table table-hover">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Position</th>
          <th scope="col" class="text-right">Age</th>
          <th scope="col" class="text-right">Level</th>
          <th scope="col" class="text-right d-none d-lg-table-cell">Sallary</th>
        </tr>
      </thead>
      <tbody>
          ${players.sort(_sortByPosition).map(renderPlayerListItem(onClickHandler)).join('')}
      </tbody>
    </table>
  `
}

/**
 * @param {Player} player
 */
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
        <td class="text-right">${_calculatePlayerAge(player)}</td>
        <td class="text-right">${player.level}</td>
        <td class="text-right d-none d-lg-table-cell">${euroFormat.format(sallaryPerLevel[player.level])}</td>
      </tr>
    `
  }
}

function _calculatePlayerAge (player) {
  return (currentSeason - player.carrier_start_season) + 16
}

/**
 * @param {Player} playerA
 * @param {Player} playerB
 * @returns {number}
 */
function _sortByPosition (playerA, playerB) {
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
