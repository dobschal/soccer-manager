import { formatDate } from '../lib/date.js'
import { Formation, getPositionsOfFormation } from '../lib/formation.js'
import { server, showServerError } from '../lib/gateway.js'
import { el, generateId } from '../lib/html.js'
import { onChange, onClick } from '../lib/htmlEventHandlers.js'
import { render } from '../lib/render.js'
import { showOverlay } from '../partials/overlay.js'
import { renderPlayersList } from '../partials/playersList.js'
import { toast } from '../partials/toast.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { getQueryParams, setQueryParams } from '../lib/router.js'
import { shadeColor } from '../lib/shadeColor.js'
import { sallaryPerLevel } from '../util/player.js'
import { euroFormat } from '../util/currency.js'
import { formatLeague } from '../util/league.js'
import { renderLineup, lineUpData } from '../partials/lineup.js'
import { randomItem } from '../util/randomItem.js'
import { renderEmblem } from '../partials/emblem.js'

let data

export async function renderMyTeamPage () {
  data = await server.getMyTeam()
  const { player_id: playerId } = getQueryParams()
  lineUpData.squadDataChanged = false
  if (playerId) {
    await showPlayerModal(Number(playerId))
  }
  const playersList = await renderPlayersList(
    data.players,
    true,
    p => { // open player modal
      setQueryParams({
        player_id: p.id
      })
    })
  return `
    <div id="header">
      ${_renderHeader()}
    </div>
    <div class="row">
      <div class="col-12 col-xl-6">
        <h3>Lineup</h3>
        <div class="mb-4" id="squad" >
          ${renderLineup(data.players, data.team)}
        </div>   
      </div>
      <div class="col-12 col-xl-6">
        ${playersList}
      </div>
    </div>
  `
}

function _renderHeader () {
  let sallary = 0
  data.players.forEach(player => {
    sallary += sallaryPerLevel[player.level]
  })
  return `
    <h2>${data.team.name}</h2>
    <div class="row"> 
      <div class="col-12 col-md-4 mb-4">     
        <div class="card bg-dark text-white" style="min-height: 230px">        
          <div class="card-body">
            <h5 class="card-title">Team</h5>
            <p class="card-text">
              <b>League: </b> ${formatLeague(data.team.level, data.team.league)}<br>
              <b>Player Sallary (∑): </b> ${euroFormat.format(sallary)}<br>
              <b>Coach: </b> ${data.user.username} since ${formatDate('DD. MMM YYYY', data.user.created_at)}<br>
              <b>Strength: </b> ${_calculateTeamStrength(data.players)}
            </p>
          </div>
        </div>        
      </div>
      <div class="col-12 col-md-4 mb-4">     
        <div class="card bg-dark text-white" style="min-height: 230px">        
          <div class="card-body" style="perspective: 40px;">
            <h5 class="card-title">Icon <i class="fa fa-pencil" aria-hidden="true"></i></h5>
            ${_renderIconViewer()}
          </div>
        </div>
      </div>
      <div class="col-12 col-md-4 mb-4">     
        <div class="card bg-dark text-white" style="min-height: 230px">        
          <div class="card-body">
            <h5 class="card-title">Lineup</h5>
            <p class="card-text">Choose from one of the following line-ups:</p>
            <div class="form-group">
              ${_renderLineupSelect()}
            </div>
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
  const id = generateId()

  onClick(id, () => {
    _showColorPicker()
  })

  renderEmblem(data.team).then(image => {
    el(id).innerHTML = image
  })

  return `<div id="${id}" class="mb-4"></div>`
}

function _showColorPicker () {
  const chars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f']
  const colors = []
  for (let j = 0; j < 50; j++) {
    let color = '#'
    for (let i = 0; i < 6; i++) {
      color += randomItem(chars)
    }
    colors.push(color)
  }
  const colorItems = colors
    .map(c => {
      const id = generateId()
      onClick(id, async () => {
        try {
          await server.updateColor({ color: c })
          toast('You have choosen a new color!')
          render('#page', await renderMyTeamPage())
          overlay.remove()
        } catch (e) {
          showServerError(e)
        }
      })
      return `
        <div id="${id}" class="color-picker-item" style="background-color: ${c}"></div>
      `
    })
    .join('')
  const overlay = showOverlay(
    'Choose a color',
    'The chosen color will be used on your trikots and team icon',
    `
      <div>
        ${colorItems}
      </div>
  `)
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
    const element = el(id)
    if (!element) return
    element.value = data.team.formation
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
  lineUpData.squadDataChanged = true
  render('#squad', renderLineup(data.players, data.team))
  render('#header', _renderHeader())
}

function _calculateTeamStrength (players) {
  return players.filter(p => p.in_game_position).reduce((sum, player) => sum + player.level, 0)
}
