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
import { calculatePlayerAge, getSalary } from '../util/player.js'
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
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'
import { YouthTeamPage } from './my-team/youthTeam.js'
import { off, on } from '../lib/event.js'
import { initDragDrop } from '../lib/dragDrop.js'

export class MyTeamPage extends UIElement {
  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <nav class="nav nav-pills mb-2">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#my-team">${t('myTeam.aTeam')}</a>
          <a class="nav-link ${this.subPage === 'youth' ? 'active' : ''}" href="#my-team?sub_page=youth">${t('myTeam.youthTeam')}</a>
        </nav>
        ${this.subPage === 'youth' ? this._renderYouthTeamPage() : this._renderATeamPage()}
      </div>
    `
  }

  /**
   * @returns {string}
   */
  _renderATeamPage () {
    return `
      <div id="header">
        ${this._renderHeader()}
      </div>
      <div class="row">
        <div class="col-12 col-xl-6">
          <h3>${t('myTeam.lineup')}</h3>
          <div class="mb-4" id="squad" >
            ${renderLineup(this.data.players, this.data.team, this)}
          </div>
        </div>
        <div class="col-12 col-xl-6" id="player-list-container">
          ${new PlayerList(
      this.data.players,
      true,
      p => { // open player modal
        setQueryParams({
          player_id: p.id
        })
      },
      true
    )}
        </div>
      </div>
    `
  }

  /**
   * @returns {string}
   */
  _renderYouthTeamPage () {
    if (!this.youthPage) {
      this.youthPage = new YouthTeamPage(this)
    }
    return this.youthPage
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
   * @param {string} params.sub_page
   * @returns {Promise<void>}
   */
  async onQueryChanged ({
    player_id: playerId,
    sub_page: subPage
  }) {
    if (playerId) {
      await showPlayerModal(Number(playerId))
    }

    // Handle tab switching
    if (subPage !== this.subPage) {
      this.subPage = subPage
      if (subPage === 'youth') {
        this.youthPage = new YouthTeamPage(this)
      }
      await this.update()
    }
  }

  /**
   * @returns {void}
   */
  onMounted () {
    void showTutorialIfNeeded('team', this)
    this._youthPlayerPromotedEventId = on('YOUTH_PLAYER_PROMOTED', async () => {
      await this.load()
      await this.update()
    })
    if (!this.subPage) {
      this._initDragDrop()
    }
  }

  /**
   * @returns {void}
   */
  onDestroy () {
    if (this._youthPlayerPromotedEventId !== undefined) {
      off(this._youthPlayerPromotedEventId)
    }
    this._dragDropCleanup?.destroy()
  }

  /**
   * Initialize drag-and-drop connections between player list and pitch
   * @returns {void}
   */
  _initDragDrop () {
    this._dragDropCleanup?.destroy()
    // Wait for child components to render
    setTimeout(() => {
      const tableBody = document.querySelector(`${this._elementQuery} #player-list-container tbody`)
      const squadEl = document.querySelector(`${this._elementQuery} #squad .squad`)
      if (!tableBody || !squadEl) return

      this._dragDropCleanup = initDragDrop({
        tableBodyEl: tableBody,
        squadEl,
        players: this.data.players,
        team: this.data.team,
        onLineupChange: async (playersToSave, formation) => {
          try {
            await server.saveLineup(playersToSave, formation)
            toast('Lineup saved.', 'success')
            lineUpData.squadDataChanged = false
            await this.load()
            await this.update()
            this._initDragDrop()
          } catch (e) {
            console.error(e)
            toast(e.message ?? 'Something went wrong...', 'error')
          }
        },
        onSortChanged: async (sortData) => {
          try {
            await server.saveBenchSortOrder(sortData)
            await this.load()
            await this.update()
            this._initDragDrop()
          } catch (e) {
            console.error(e)
            toast(e.message ?? 'Something went wrong...', 'error')
          }
        }
      })
    }, 200)
  }

  /**
   * @returns {string}
   */
  _renderHeader () {
    const realPlayers = this.data.players.filter(p => !p.fake)
    const totalSalary = realPlayers.reduce((sum, p) => sum + getSalary(p.level), 0)
    const totalStrength = realPlayers.reduce((sum, p) => sum + p.level, 0)
    const lineupStrength = this._calculateTeamStrength(this.data.players)
    const avgLevel = realPlayers.length > 0 ? (totalStrength / realPlayers.length).toFixed(1) : 0
    const avgAge = realPlayers.length > 0
      ? (realPlayers.reduce((sum, p) => sum + calculatePlayerAge(p, this.season), 0) / realPlayers.length).toFixed(1)
      : 0

    const teamNameId = generateId()
    onClick(teamNameId, () => {
      this._showTeamNameEditor()
    })

    return `
      <h2 id="${teamNameId}" class="u-cursor-pointer" title="${t('myTeam.clickToEditName')}">
        ${this.data.team.name} <i class="fa fa-pencil" aria-hidden="true"></i>
      </h2>
      <div class="row">
        <div class="col-12 col-md-4 mb-4">
          <div class="card h-100 border-0">
            <div class="card-header text-white gradient-header">
              <h5 class="card-title mb-0">${t('myTeam.teamInfo')}</h5>
            </div>
            <div class="card-body">
              <p class="card-text">
                <b>${t('myTeam.league')}</b> ${formatLeague(this.data.team.level, this.data.team.league)}<br>
                <b>${t('myTeam.salaryTotal')}</b> ${euroFormat.format(totalSalary)}<br>
                <b>${t('myTeam.avgAge')}</b> ${avgAge} ${t('myTeam.years')}<br>
                <b>${t('myTeam.avgLevel')}</b> ${avgLevel}<br>
                <b>${t('myTeam.totalStrength')}</b> ${totalStrength}<br>
                <b>${t('myTeam.lineupStrength')}</b> ${lineupStrength}
              </p>
            </div>
          </div>
        </div>
        <div class="col-12 col-md-4 mb-4">
          <div class="card h-100 border-0">
            <div class="card-header text-white gradient-header">
              <h5 class="card-title mb-0">${t('myTeam.emblem')} <i class="fa fa-pencil" aria-hidden="true"></i></h5>
            </div>
            <div class="card-body u-perspective-40">
              ${this._renderEmblemViewer()}
            </div>
          </div>
        </div>
        <div class="col-12 col-md-4 mb-4">
          <div class="card h-100 border-0">
            <div class="card-header text-white gradient-header">
              <h5 class="card-title mb-0">${t('myTeam.tactic')}</h5>
            </div>
            <div class="card-body">              
              <div class="form-group mb-3">
                <p class="card-text mb-0">${t('myTeam.chooseLineup')}</p>
                ${this._renderLineupSelect()}
              </div>              
              <div class="form-group mb-3">
                <p class="card-text mb-0">${t('myTeam.choosePassStyle')}</p>
                ${this._renderPassStyleSelect()}
              </div>              
              <div class="form-group">
              <p class="card-text mb-0">${t('myTeam.choosePlayStyle')}</p>
                ${this._renderPlayStyleSelect()}
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

    return `<div id="${id}" class="mb-4 emblem-viewer">
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
   * @returns {string}
   */
  _renderPassStyleSelect () {
    const id = generateId()
    const passStyles = ['short', 'mixed', 'long']
    const currentPassStyle = this.data.team.pass_style || 'mixed'
    onChange(id, async (event) => {
      if (event.target.value !== currentPassStyle) {
        try {
          await server.updatePassStyle(event.target.value)
          this.data.team.pass_style = event.target.value
          toast(t('myTeam.passStyleUpdated'), 'success')
        } catch (e) {
          showServerError(e)
        }
      }
    })
    setTimeout(() => {
      const element = el(id)
      if (!element) return
      element.value = currentPassStyle
    })
    return `
      <select id="${id}" class="form-control">
        ${passStyles.map(style => `<option value="${style}">${t('myTeam.passStyle.' + style)}</option>`).join('')}
      </select>
    `
  }

  /**
   * @returns {string}
   */
  _renderPlayStyleSelect () {
    const id = generateId()
    const playStyles = ['aggressive', 'normal', 'friendly']
    const currentPlayStyle = this.data.team.play_style || 'normal'
    onChange(id, async (event) => {
      if (event.target.value !== currentPlayStyle) {
        try {
          await server.updatePlayStyle(event.target.value)
          this.data.team.play_style = event.target.value
          toast(t('myTeam.playStyleUpdated'), 'success')
        } catch (e) {
          showServerError(e)
        }
      }
    })
    setTimeout(() => {
      const element = el(id)
      if (!element) return
      element.value = currentPlayStyle
    })
    return `
      <select id="${id}" class="form-control">
        ${playStyles.map(style => `<option value="${style}" title="${t('myTeam.playStyleDesc.' + style)}">${t('myTeam.playStyle.' + style)}</option>`).join('')}
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
    this._initDragDrop()
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
            document.querySelectorAll('.emblem-editor__option').forEach(item => {
              item.classList.remove('emblem-editor__option--selected')
            })
            element.classList.add('emblem-editor__option--selected')
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
        <div id="${id}" class="emblem-editor__option ${isSelected ? 'emblem-editor__option--selected' : ''}">
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
            document.querySelectorAll('.emblem-editor__option--pattern').forEach(item => {
              item.classList.remove('emblem-editor__option--selected')
            })
            element.classList.add('emblem-editor__option--selected')
            updatePreview()
          })
        }
      }, 100)
      const isSelected = key === selectedPattern
      return `
        <div id="${id}" class="emblem-editor__option emblem-editor__option--pattern ${isSelected ? 'emblem-editor__option--selected' : ''}">
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
            document.querySelectorAll('.emblem-editor__color').forEach(item => {
              item.classList.remove('emblem-editor__color--selected')
            })
            element.classList.add('emblem-editor__color--selected')
            updatePreview()
          })
        }
      }, 100)
      const isSelected = c === selectedColor
      // Note: background-color must remain inline as it's dynamic per color
      return `
        <div id="${id}" class="emblem-editor__color ${isSelected ? 'emblem-editor__color--selected' : ''}" style="background-color: ${c};"></div>
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
        toast(t('myTeam.emblemUpdated'), 'success')
        this.data.team.emblem = emblemParams
        this.data.team.color = selectedColor
        await this.update(true)
        overlay.remove()
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      t('myTeam.createEmblem'),
      t('myTeam.designEmblem'),
      `
      <div class="emblem-editor__preview">
        <div id="${previewId}">${generateEmblem({
        shape: selectedShape,
        pattern: selectedPattern,
        color: selectedColor,
        teamName: this.data.team.name,
        size: 150
      })}</div>
      </div>

      <h6>${t('myTeam.shape')}</h6>
      <div class="emblem-editor__section">
        ${shapeOptions}
      </div>

      <h6>${t('myTeam.pattern')}</h6>
      <div class="emblem-editor__section">
        ${patternOptions}
      </div>

      <h6>${t('myTeam.color')}</h6>
      <div class="emblem-editor__section mb-4">
        ${colorOptions}
      </div>

      <button id="${saveButtonId}" class="btn btn-info w-100">${t('myTeam.saveEmblem')}</button>
    `)
  }

  /**
   * @returns {Promise<void>}
   */
  async _showTeamNameEditor () {
    // Fetch name library from server
    const nameLibrary = await server.getNameLibrary()
    const {
      clubPrefixes1,
      clubPrefixes2,
      cityNames
    } = nameLibrary

    // Parse current team name to extract parts
    const currentName = this.data.team.name
    const nameParts = currentName.trim().split(' ')

    // Try to find matching parts in the arrays
    let selectedPrefix1 = ''
    let selectedPrefix2 = ''
    let selectedCity = ''

    // Simple logic to extract parts: check if parts exist in arrays
    if (nameParts.length >= 3) {
      const lastPart = nameParts[nameParts.length - 1]
      const middlePart = nameParts[nameParts.length - 2]
      const firstParts = nameParts.slice(0, -2).join(' ')

      if (cityNames.includes(lastPart)) selectedCity = lastPart
      if (clubPrefixes2.includes(middlePart)) selectedPrefix2 = middlePart
      if (clubPrefixes1.includes(firstParts)) selectedPrefix1 = firstParts
    } else if (nameParts.length === 2) {
      const lastPart = nameParts[1]
      const firstPart = nameParts[0]

      if (cityNames.includes(lastPart)) selectedCity = lastPart
      if (clubPrefixes2.includes(firstPart)) selectedPrefix2 = firstPart
    } else if (nameParts.length === 1) {
      if (cityNames.includes(nameParts[0])) selectedCity = nameParts[0]
    }

    const prefix1SelectId = generateId()
    const prefix2SelectId = generateId()
    const citySelectId = generateId()
    const saveButtonId = generateId()
    const previewId = generateId()

    // Simple HTML escape for safety
    const escapeHtml = (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

    const updatePreview = () => {
      const prefix1 = el(prefix1SelectId)?.value || ''
      const prefix2 = el(prefix2SelectId)?.value || ''
      const city = el(citySelectId)?.value || ''
      const newName = `${prefix1} ${prefix2} ${city}`.trim()
      const previewEl = el(previewId)
      if (previewEl) {
        previewEl.textContent = newName
      }
    }

    // Create select options
    const prefix1Options = clubPrefixes1.map(p =>
      `<option value="${escapeHtml(p)}" ${p === selectedPrefix1 ? 'selected' : ''}>${escapeHtml(p) || '(none)'}</option>`
    ).join('')

    const prefix2Options = clubPrefixes2.map(p =>
      `<option value="${escapeHtml(p)}" ${p === selectedPrefix2 ? 'selected' : ''}>${escapeHtml(p)}</option>`
    ).join('')

    const cityOptions = cityNames.map(c =>
      `<option value="${escapeHtml(c)}" ${c === selectedCity ? 'selected' : ''}>${escapeHtml(c)}</option>`
    ).join('')

    // Add change listeners
    setTimeout(() => {
      const prefix1El = el(prefix1SelectId)
      const prefix2El = el(prefix2SelectId)
      const cityEl = el(citySelectId)

      if (prefix1El) prefix1El.addEventListener('change', updatePreview)
      if (prefix2El) prefix2El.addEventListener('change', updatePreview)
      if (cityEl) cityEl.addEventListener('change', updatePreview)

      updatePreview()
    }, 100)

    // Save button handler
    onClick(saveButtonId, async () => {
      try {
        const prefix1 = el(prefix1SelectId)?.value || ''
        const prefix2 = el(prefix2SelectId)?.value || ''
        const city = el(citySelectId)?.value || ''
        const newName = `${prefix1} ${prefix2} ${city}`.trim()

        if (!newName) {
          toast(t('myTeam.selectNamePart'), 'error')
          return
        }

        await server.updateTeamName(newName)
        toast(t('myTeam.nameUpdated'), 'success')
        this.data.team.name = newName
        await this.update(true)
        overlay.remove()
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      t('myTeam.customizeTeamName'),
      t('myTeam.createUniqueName'),
      `
      <div class="mb-4">
        <h6>${t('myTeam.preview')}</h6>
        <div id="${previewId}" class="team-name-preview">
          ${escapeHtml(currentName)}
        </div>
      </div>

      <div class="form-group mb-3">
        <label for="${prefix1SelectId}"><h6>${t('myTeam.clubPrefix1')}</h6></label>
        <select id="${prefix1SelectId}" class="form-control">
          ${prefix1Options}
        </select>
      </div>

      <div class="form-group mb-3">
        <label for="${prefix2SelectId}"><h6>${t('myTeam.clubPrefix2')}</h6></label>
        <select id="${prefix2SelectId}" class="form-control">
          ${prefix2Options}
        </select>
      </div>

      <div class="form-group mb-3">
        <label for="${citySelectId}"><h6>${t('myTeam.cityName')}</h6></label>
        <select id="${citySelectId}" class="form-control">
          ${cityOptions}
        </select>
      </div>

      <button id="${saveButtonId}" class="btn btn-primary w-100">${t('myTeam.saveTeamName')}</button>
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
