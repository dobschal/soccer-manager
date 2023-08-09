import { renderPlayerImage } from './playerImage.js'
import { el, generateId } from '../lib/html.js'

export function renderGameAnimation (game, team1, team2) {
  const details = JSON.parse(game.details)
  console.log(details, game)
  /** @type {PlayerType[]} */
  const playerTeamA = details.playerTeamA
  /** @type {PlayerType[]} */
  const playerTeamB = details.playerTeamB

  // position hack for 2x CM and 2x CD
  setTimeout(() => {
    ['.player.home.CM', '.player.home.CD', '.player.home.DM', '.player.away.CM', '.player.away.CD', '.player.away.DM'].forEach(positionClass => {
      const el = document.querySelectorAll(positionClass)
      console.log('Elements: ', el)
      if (el.length === 2) {
        el.item(0).style.top = '38%'
        el.item(1).style.top = '62%'
      }
    })
  }, 1000)

  return `<div class="game-animation">
        ${playerTeamA.map(_renderTeamPlayer(team1, 'home')).join('')}
        ${playerTeamB.map(_renderTeamPlayer(team2, 'away')).join('')}
    </div>`
}

function _renderTeamPlayer (team, type) {
  return (player) => {
    const id = generateId()
    console.log('Team: ', team.name, team.color)
    renderPlayerImage(player, team, 50).then(image => el(id)?.insertAdjacentHTML('afterbegin', image)).catch(() => console.error('Could not load player image'))
    setTimeout(() => el(id)?.classList.add(player.in_game_position), 500)
    return `
        <div class="player ${type}" id="${id}">
          ${player.name.split(' ')[1]} (${player.level.toFixed(2)})
        </div>
      `
  }
}
