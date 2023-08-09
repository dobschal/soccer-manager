import { updater } from '../lib/updater.js'
import { renderPlayerImage } from './playerImage.js'
import { el, generateId } from '../lib/html.js'

export function renderGameAnimation (game, team1, team2) {
  const details = JSON.parse(game.details)
  console.log(details, game)
  /** @type {PlayerType[]} */
  const playerTeamA = details.playerTeamA
  /** @type {PlayerType[]} */
  // const playerTeamB = details.playerTeamB

  return `<div class="game-animation">
        ${playerTeamA.map(_renderHomeTeamPlayer(team1)).join('')}
    </div>`
}

function _renderHomeTeamPlayer (team) {
  return (player) => {
    const id = generateId()
    renderPlayerImage(player, team, 50).then(image => el(id)?.insertAdjacentHTML('afterbegin', image)).catch(() => console.error('Could not load player image'))
    return `
        <div class="player home ${player.in_game_position}" id="${id}">
          ${player.name.split(' ')[1]} (${player.level.toFixed(2)})
        </div>
      `
  }
}
