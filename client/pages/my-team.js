import { formatDate } from '../lib/date.js'
import { Formation, getPositionsOfFormation } from '../util/formation.js'
import { server, showServerError } from '../lib/gateway.js'
import { el, generateId } from '../lib/html.js'
import { onChange, onClick } from '../lib/htmlEventHandlers.js'
import { render } from '../lib/render.js'
import { showOverlay } from '../partials/overlay.js'
import { PlayerList } from '../partials/playerList.js'
import { toast } from '../partials/toast.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { setQueryParams } from '../lib/router.js'
import { sallaryPerLevel } from '../util/player.js'
import { euroFormat } from '../lib/currency.js'
import { formatLeague } from '../util/league.js'
import { renderLineup, lineUpData } from '../partials/lineup.js'
import { randomItem } from '../lib/randomItem.js'
import { Emblem } from '../partials/emblem.js'
import { UIElement } from '../lib/UIElement.js'

export class MyTeamPage extends UIElement {
  get template () {
    return `
      <div>
        <div id="header">
          ${this._renderHeader()}
        </div>
        <div class="row">
          <div class="col-12 col-xl-6">
            <h3>Lineup</h3>
            <div class="mb-4" id="squad" >
              ${renderLineup(this.data.players, this.data.team, this)}
            </div>   
          </div>
          <div class="col-12 col-xl-6">
            ${new PlayerList(
              this.data.players,
              true,
              p => { // open player modal
                setQueryParams({
                  player_id: p.id
                })
              })
            }
          </div>
        </div>
      </div>
    `
  }

  async load () {
    this.data = await server.getMyTeam()
    lineUpData.squadDataChanged = false
  }

  async onQueryChanged ({ player_id: playerId }) {
    if (playerId) {
      await showPlayerModal(Number(playerId))
    }
  }

  _renderHeader () {
    let sallary = 0
    this.data.players.forEach(player => {
      sallary += sallaryPerLevel[player.level]
    })
    return `
      <h2>${this.data.team.name}</h2>
      <div class="row"> 
        <div class="col-12 col-md-4 mb-4">     
          <div class="card bg-dark text-white" style="min-height: 230px">        
            <div class="card-body">
              <h5 class="card-title">Team</h5>
              <p class="card-text">
                <b>League: </b> ${formatLeague(this.data.team.level, this.data.team.league)}<br>
                <b>Player Sallary (∑): </b> ${euroFormat.format(sallary)}<br>
                <b>Coach: </b> ${this.data.user.username} since ${formatDate('DD. MMM YYYY', this.data.user.created_at)}<br>
                <b>Strength: </b> ${this._calculateTeamStrength(this.data.players)}
              </p>
            </div>
          </div>        
        </div>
        <div class="col-12 col-md-4 mb-4">     
          <div class="card bg-dark text-white" style="min-height: 230px">        
            <div class="card-body" style="perspective: 40px;">
              <h5 class="card-title">Icon <i class="fa fa-pencil" aria-hidden="true"></i></h5>
              ${this._renderIconViewer()}
            </div>
          </div>
        </div>
        <div class="col-12 col-md-4 mb-4">     
          <div class="card bg-dark text-white" style="min-height: 230px">        
            <div class="card-body">
              <h5 class="card-title">Lineup</h5>
              <p class="card-text">Choose from one of the following line-ups:</p>
              <div class="form-group">
                ${this._renderLineupSelect()}
              </div>
            </div>
          </div>
        </div>      
      </div>
    `
  }

  _renderIconViewer () {
    const id = generateId()

    onClick(id, () => {
      this._showColorPicker()
    })

    return `<div id="${id}" class="mb-4">
      ${new Emblem({ team: this.data.team })}
    </div>`
  }

  _renderLineupSelect () {
    const id = generateId()
    const currentFormation = this.data.team.formation
    onChange(id, (event) => {
      if (event.target.value !== currentFormation) {
        this._changeFormation(event.target.value)
      }
    })
    setTimeout(() => {
      const element = el(id)
      if (!element) return
      element.value = this.data.team.formation
    })
    return `
      <select id="${id}" class="form-control">
        ${Object.values(Formation).map(f => `<option value="${f}">${f}</option>`)}
      </select>
    `
  }

  _changeFormation (newFormation) {
    this.data.team.formation = newFormation
    this.data.players = this.data.players.filter(p => !p.fake)
    this.data.players.forEach(player => {
      player.in_game_position = ''
    })
    const positions = getPositionsOfFormation(newFormation)
    positions.forEach(position => {
      this.data.players.push({
        fake: true,
        in_game_position: position,
        position,
        level: 0,
        name: '-'
      })
    })
    lineUpData.squadDataChanged = true
    render('#squad', renderLineup(this.data.players, this.data.team, this))
    render('#header', this._renderHeader())
  }

  _showColorPicker () {
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
            toast('You have chosen a new color!', 'success')
            await this.update(false)
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

  _calculateTeamStrength (players) {
    return players.filter(p => p.in_game_position).reduce((sum, player) => sum + player.level, 0)
  }
}
