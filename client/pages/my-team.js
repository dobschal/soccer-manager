import { formatDate } from '../lib/date.js'
import { Formation, getPositionsOfFormation } from '../lib/formation.js'
import { server } from '../lib/gateway.js'
import { el, generateId } from '../lib/html.js'
import { onChange, onClick } from '../lib/htmlEventHandlers.js'
import { render } from '../lib/render.js'
import { showOverlay } from '../partials/overlay.js'
import { renderPlayersList } from '../partials/playersList.js'
import { toast } from '../partials/toast.js'
import { showPlayerModal } from '../partials/playerModal.js'

let data, overlay, dataChanged

export async function renderMyTeamPage () {
  dataChanged = false
  data = await server.getMyTeam()
  const playersList = await renderPlayersList(data.players, true, showPlayerModal)
  return `
    <div class="mb-4" id="header">
      ${_renderHeader()}
    </div>
    <div class="row">
      <div class="col-12 col-xl-6">
        <h3>Lineup</h3>
        <div class="mb-4" id="squad" >
          ${_renderSquad()}
        </div>   
      </div>
      <div class="col-12 col-xl-6">
        ${playersList}
      </div>
    </div>
  `
}

function _renderHeader () {
  return `
    <h2>${data.team.name}</h2>
    <div class="row"> 
      <div class="col-12 col-md-4 mb-2">     
        <div class="card bg-dark text-white">        
          <div class="card-body">
            <h5 class="card-title">Team</h5>
            <p class="card-text">
              <b>League: </b> ???<br>
              <b>Player Sallary: </b> ???<br>
              <b>Coach: </b> ${data.user.username} since ${formatDate('DD. MMM YYYY', data.user.created_at)}<br>
              <b>Strength: </b> ${_calculateTeamStrength(data.players)}
            </p>
          </div>
        </div>        
      </div>
      <div class="col-12 col-md-4 mb-2">     
        <div class="card bg-dark text-white">        
          <div class="card-body">
            <h5 class="card-title">Lineup</h5>
            <p class="card-text">Choose from one of the following line-ups:</p>
            <div class="form-group">
              ${_renderLineupSelect()}
            </div>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-4 mb-2">     
        <div class="card bg-dark text-white">        
          <div class="card-body">
            <h5 class="card-title">Icon</h5>
            ${_renderIconViewer()}
          </div>
        </div>
      </div>
    </div>
  `
}

/**
 * @returns {string}
 * @private
 */
function _renderIconViewer () {
  const color = data.team.color
  return `
    <div class="wappen mb-4" style="background-color: ${color}">
        ${data.team.name}
    </div>
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
    <select id="${id}" class="form-control">
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
    ['.player.CM', '.player.CD', '.player.DM'].forEach(positionClass => {
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
      toast(e.message ?? 'Something went wrong...', 'error')
    }
  })
  return `
    <button id="${id}" class="btn btn-primary w-100" type="button">Save</button>
  `
}

function _renderSquadPlayer (player) {
  const id = generateId()
  onClick('#' + id, async () => {
    overlay = showOverlay(
      'Select player',
      '',
      `${await renderPlayersList(data.players.filter(p => p.position === player.position), false, newPlayer => _exchangePlayer(player, newPlayer))}`
    )
  })
  return `
    <div id="${id}" class="player ${player.position}">
      <span class="position-badge ${player.position}">${player.position}</span>
      ${player.name.includes(' ') ? player.name.split(' ')[0][0] + ' ' + (player.name.split(' ')[1] ?? '') : player.name}
      <span class="level-badge level-${player.level}">${player.level}</span>
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
