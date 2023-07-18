import { formatDate } from '../lib/date.js'
import { Formation, getPositionsOfFormation } from '../lib/formation.js'
import { server } from '../lib/gateway.js'
import { el, generateId } from '../lib/html.js'
import { onChange, onClick } from '../lib/htmlEventHandlers.js'
import { render } from '../lib/render.js'
import { showOverlay } from '../partials/overlay.js'
import { renderPlayerListItem, renderPlayersList } from '../partials/playersList.js'
import { toast } from '../partials/toast.js'

let data, overlay, dataChanged

export async function renderMyTeamPage () {
  dataChanged = false
  data = await server.getMyTeam()
  console.log('Data: ', data)
  const playersList = await renderPlayersList(data.players)
  return `
    <div class="mb-4" id="header">
      ${_renderHeader()}
    </div>
    <h3>Lineup</h3>
    <div class="mb-4" id="squad">
      ${_renderSquad()}
    </div>   
    ${playersList}
  `
}

function _renderHeader () {
  return `
    <h2>${data.team.name}</h2>
    <p>
      <b>Coach</b>: ${data.user.username} since ${formatDate('DD. MMM YYYY', data.user.created_at)}<br>
      <b>Team Strength</b>: ${_calculateTeamStrength(data.players)}<br>
      <b>Lineup</b>: ${_renderLineupSelect()}
    </p>
  `
}

function _renderLineupSelect () {
  const id = generateId()
  const currentFormation = data.team.formation
  onChange('#' + id, (event) => {
    if (event.target.value !== currentFormation) {
      _changeFormation(event.target.value)
    }
  })
  setTimeout(() => {
    el('#' + id).value = data.team.formation
  })
  return `
    <select id="${id}">
      ${Object.values(Formation).map(f => `<option value="${f}">${f}</option>`)}
    </select>
  `
}

function _changeFormation (newFormation) {
  data.team.formation = newFormation
  data.players = data.players.filter(p => !p.fake)
  data.players.forEach(player => {
    player.in_game_position = ''
  })
  const positions = getPositionsOfFormation(newFormation)
  positions.forEach(position => {
    data.players.push({
      fake: true,
      in_game_position: position,
      position,
      level: 0,
      name: '-'
    })
  })
  dataChanged = true
  render('#squad', _renderSquad())
  render('#header', _renderHeader())
}

function _calculateTeamStrength (players) {
  return players.filter(p => p.in_game_position).reduce((sum, player) => sum + player.level, 0)
}

function _renderSquad () {
  // position hack for 2x CM and 2x CD
  setTimeout(() => {
    ['.CM', '.CD', '.DM'].forEach(positionClass => {
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
      if (data.players.some(p => p.fake && p.in_game_position)) {
        return toast('Your lineup is incomplete!')
      }
      data.players = data.players.filter(p => !p.fake)
      await server.saveLineup({ players: data.players, formation: data.team.formation })
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
            ${data.players.filter(p => p.position === player.position).map(renderPlayerListItem(newPlayer => _exchangePlayer(player, newPlayer))).join('')}
        </tbody>
      </table>
    `)
  })
  return `
    <div id="${id}" class="player ${player.position}">
      <span class="position-badge">${player.position}</span>
      ${player.name.includes(' ') ? player.name.split(' ')[0][0] + ' ' + (player.name.split(' ')[1] ?? '') : player.name}
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
