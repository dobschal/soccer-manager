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
import { sallaryPerLevel, calculatePlayerAge } from '../util/player.js'
import { euroFormat } from '../lib/currency.js'
import { formatLeague } from '../util/league.js'
import { lineUpData, renderLineup } from '../partials/lineup.js'
import { renderEmblem } from '../partials/emblem.js'
import {
  EMBLEM_COLORS,
  EMBLEM_PATTERNS,
  EMBLEM_SHAPES,
  generateEmblem,
  parseEmblemParams
} from '../util/emblemGenerator.js'
import { UIElement } from '../lib/UIElement.js'

export class MyTeamPage extends UIElement {
  /**
   * @returns {string}
   */
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

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const [teamData, gamedayData] = await Promise.all([
      server.getMyTeam(),
      server.getCurrentGameday()
    ])
    this.data = teamData
    this.season = gamedayData.season
    lineUpData.squadDataChanged = false
  }

  /**
   * @param {Object} params
   * @param {string} params.player_id
   * @returns {Promise<void>}
   */
  async onQueryChanged ({ player_id: playerId }) {
    if (playerId) {
      await showPlayerModal(Number(playerId))
    }
  }

  /**
   * @returns {string}
   */
  _renderHeader () {
    const realPlayers = this.data.players.filter(p => !p.fake)
    const totalSalary = realPlayers.reduce((sum, p) => sum + sallaryPerLevel[p.level], 0)
    const totalStrength = realPlayers.reduce((sum, p) => sum + p.level, 0)
    const lineupStrength = this._calculateTeamStrength(this.data.players)
    const avgLevel = realPlayers.length > 0 ? (totalStrength / realPlayers.length).toFixed(1) : 0
    const avgAge = realPlayers.length > 0
      ? (realPlayers.reduce((sum, p) => sum + calculatePlayerAge(p, this.season), 0) / realPlayers.length).toFixed(1)
      : 0
    return `
      <h2>${this.data.team.name}</h2>
      <div class="row">
        <div class="col-12 col-md-4 mb-4">
          <div class="card h-100 text-white" style="background: #333">
            <div class="card-body">
              <h5 class="card-title">Team Info</h5>
              <p class="card-text">
                <b>League: </b> ${formatLeague(this.data.team.level, this.data.team.league)}<br>
                <b>Salary (∑): </b> ${euroFormat.format(totalSalary)}<br>
                <b>Avg. Age: </b> ${avgAge} years<br>
                <b>Avg. Level: </b> ${avgLevel}<br>
                <b>Total Strength: </b> ${totalStrength}<br>
                <b>Lineup Strength: </b> ${lineupStrength}
              </p>
            </div>
          </div>
        </div>
        <div class="col-12 col-md-4 mb-4">
          <div class="card h-100 text-white" style="background: #333">
            <div class="card-body" style="perspective: 40px;">
              <h5 class="card-title">Emblem <i class="fa fa-pencil" aria-hidden="true"></i></h5>
              ${this._renderEmblemViewer()}
            </div>
          </div>
        </div>
        <div class="col-12 col-md-4 mb-4">
          <div class="card h-100 text-white" style="background: #333">
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

  /**
   * @returns {string}
   */
  _renderEmblemViewer () {
    const id = generateId()

    onClick(id, () => {
      this._showEmblemEditor()
    })

    return `<div id="${id}" class="mb-4" style="cursor: pointer; text-align: center;">
      ${renderEmblem(this.data.team, 150)}
    </div>`
  }

  /**
   * @returns {string}
   */
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

  /**
   * @param {string} newFormation
   * @returns {void}
   */
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

  /**
   * @returns {void}
   */
  _showEmblemEditor () {
    // Get current emblem params or defaults
    const currentParams = parseEmblemParams(this.data.team.emblem) || {
      shape: 'shield',
      pattern: 'solid',
      color: this.data.team.color || EMBLEM_COLORS[0]
    }

    let selectedShape = currentParams.shape
    let selectedPattern = currentParams.pattern
    let selectedColor = currentParams.color

    const previewId = generateId()
    const saveButtonId = generateId()

    const updatePreview = () => {
      const previewEl = el(previewId)
      if (previewEl) {
        previewEl.innerHTML = generateEmblem({
          shape: selectedShape,
          pattern: selectedPattern,
          color: selectedColor,
          teamName: this.data.team.name,
          size: 150
        })
      }
    }

    // Shape options
    const shapeOptions = Object.entries(EMBLEM_SHAPES).map(([key]) => {
      const id = generateId()
      setTimeout(() => {
        const element = el(id)
        if (element) {
          element.addEventListener('click', () => {
            selectedShape = key
            document.querySelectorAll('.shape-option').forEach(item => {
              item.style.borderColor = 'transparent'
            })
            element.style.borderColor = '#007bff'
            updatePreview()
          })
        }
      }, 100)
      const isSelected = key === selectedShape
      const previewSvg = generateEmblem({
        shape: key,
        pattern: 'solid',
        color: '#666',
        teamName: '',
        size: 40
      })
      return `
        <div id="${id}" class="shape-option" style="display: inline-block; padding: 8px; margin: 4px; border: 2px solid ${isSelected ? '#007bff' : 'transparent'}; border-radius: 4px; cursor: pointer; background: rgba(0,0,0,0.1);">
          ${previewSvg}
        </div>
      `
    }).join('')

    // Pattern options
    const patternOptions = Object.entries(EMBLEM_PATTERNS).map(([key, pattern]) => {
      const id = generateId()
      setTimeout(() => {
        const element = el(id)
        if (element) {
          element.addEventListener('click', () => {
            selectedPattern = key
            document.querySelectorAll('.pattern-option').forEach(item => {
              item.style.borderColor = 'transparent'
            })
            element.style.borderColor = '#007bff'
            updatePreview()
          })
        }
      }, 100)
      const isSelected = key === selectedPattern
      return `
        <div id="${id}" class="pattern-option" style="display: inline-block; padding: 8px 12px; margin: 4px; border: 2px solid ${isSelected ? '#007bff' : 'transparent'}; border-radius: 4px; cursor: pointer; background: rgba(0,0,0,0.1); font-size: 14px;">
          ${pattern.name}
        </div>
      `
    }).join('')

    // Color options (20 predefined colors)
    const colorOptions = EMBLEM_COLORS.map(c => {
      const id = generateId()
      setTimeout(() => {
        const element = el(id)
        if (element) {
          element.addEventListener('click', () => {
            selectedColor = c
            document.querySelectorAll('.color-option').forEach(item => {
              item.style.border = '2px solid transparent'
            })
            element.style.border = '2px solid white'
            updatePreview()
          })
        }
      }, 100)
      const isSelected = c === selectedColor
      return `
        <div id="${id}" class="color-option" style="display: inline-block; width: 36px; height: 36px; margin: 3px; border-radius: 4px; cursor: pointer; background-color: ${c}; border: 2px solid ${isSelected ? 'black' : 'transparent'};"></div>
      `
    }).join('')

    // Save button handler
    onClick(saveButtonId, async () => {
      try {
        const emblemParams = JSON.stringify({
          shape: selectedShape,
          pattern: selectedPattern,
          color: selectedColor
        })
        await server.updateEmblem(emblemParams, selectedColor)
        toast('Your emblem has been updated!', 'success')
        this.data.team.emblem = emblemParams
        this.data.team.color = selectedColor
        await this.update(false)
        overlay.remove()
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      'Create Your Emblem',
      'Design a unique emblem for your team',
      `
      <div style="text-align: center; margin-bottom: 20px;">
        <div id="${previewId}">${generateEmblem({
        shape: selectedShape,
        pattern: selectedPattern,
        color: selectedColor,
        teamName: this.data.team.name,
        size: 150
      })}</div>
      </div>

      <h6>Shape</h6>
      <div style="margin-bottom: 15px; text-align: center;">
        ${shapeOptions}
      </div>

      <h6>Pattern</h6>
      <div style="margin-bottom: 15px; text-align: center;">
        ${patternOptions}
      </div>

      <h6>Color</h6>
      <div style="margin-bottom: 20px; text-align: center;">
        ${colorOptions}
      </div>

      <button id="${saveButtonId}" class="btn btn-primary w-100">Save Emblem</button>
    `)
  }

  /**
   * @param {Array} players
   * @returns {number}
   */
  _calculateTeamStrength (players) {
    return players.filter(p => p.in_game_position).reduce((sum, player) => sum + player.level, 0)
  }
}
