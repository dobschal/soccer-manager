import { Formation, getPositionsOfFormation } from '../../util/formation.js'
import { server, showServerError } from '../../lib/gateway.js'
import { el, generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { showOverlay } from '../../partials/overlay.js'
import { PlayerList } from '../../partials/playerList.js'
import { toast } from '../../partials/toast.js'
import { renderPlayerImage } from '../../partials/playerImage.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'
import { setQueryParams } from '../../lib/router.js'
import { calculatePlayerAge, getSalary, sortByPosition } from '../../util/player.js'
import { euroFormat } from '../../lib/currency.js'
import { formatLeague } from '../../util/league.js'
import { Lineup, lineUpData } from '../../partials/lineup.js'
import { off, on } from '../../lib/event.js'
import { renderEmblem } from '../../partials/emblem.js'
import {
  EMBLEM_COLORS,
  EMBLEM_PATTERNS,
  EMBLEM_SHAPES,
  generateEmblem,
  parseEmblemParams,
  splitTeamName
} from '../../util/emblemGenerator.js'
import { t } from '../../i18n/index.js'
import { UIElement } from '../../lib/UIElement.js'

export class ATeamPage extends UIElement {

  /**
   * @param {import('../my-team.js').MyTeamPage} parent
   */
  constructor (parent) {
    super()
    this.parent = parent
    this._playerList = null
    this._exchangeEventId = on('lineup-exchange', (updatedPlayers) => {
      this.parent.data.players = updatedPlayers
      if (this._playerList) {
        this._playerList.players = updatedPlayers.filter(p => !p.fake).sort(sortByPosition)
        this._playerList.update()
      }
      this.update()
    })
    this._captainClearedEventId = on('captain-cleared', () => {
      this.parent.data.team.captain_id = null
      this.update()
    })
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <div id="header">
          ${this._renderHeader()}
        </div>
        <h3>${t('myTeam.lineup')}</h3>
        <div class="mb-4" id="squad">
          ${new Lineup(this.parent.data.players, this.parent.data.team)}
        </div>
        <div class="mb-4">
          <h3 >${t('myTeam.bench')}</h3>
          <div class="bench-slots d-flex gap-3 flex-wrap" id="bench">
            ${this._renderBenchSlots()}
          </div>
        </div>
        <div class="mb-4">
          <h3>${t('myTeam.chooseCaptain')}</h3>
          ${this._renderCaptainSelect()}
        </div>
        <div id="player-list-container">
          ${this._createPlayerList()}
        </div>
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.lineup-select': {
        change: (e) => {
          if (e.target.value !== this.parent.data.team.formation) {
            this._changeFormation(e.target.value)
          }
        }
      },
      '.pass-style-select': {
        change: async (e) => {
          const currentPassStyle = this.parent.data.team.pass_style || 'mixed'
          if (e.target.value !== currentPassStyle) {
            try {
              await server.updatePassStyle(e.target.value)
              this.parent.data.team.pass_style = e.target.value
              toast(t('myTeam.passStyleUpdated'), 'success')
            } catch (err) {
              showServerError(err)
            }
          }
        }
      },
      '.play-style-select': {
        change: async (e) => {
          const currentPlayStyle = this.parent.data.team.play_style || 'normal'
          if (e.target.value !== currentPlayStyle) {
            try {
              await server.updatePlayStyle(e.target.value)
              this.parent.data.team.play_style = e.target.value
              toast(t('myTeam.playStyleUpdated'), 'success')
            } catch (err) {
              showServerError(err)
            }
          }
        }
      },
      '.attack-mode-select': {
        change: async (e) => {
          const currentAttackMode = this.parent.data.team.attack_mode || 'balanced'
          if (e.target.value !== currentAttackMode) {
            try {
              await server.updateAttackMode(e.target.value)
              this.parent.data.team.attack_mode = e.target.value
              toast(t('myTeam.attackModeUpdated'), 'success')
            } catch (err) {
              showServerError(err)
            }
          }
        }
      },
      '.captain-select': {
        change: async (e) => {
          const newCaptainId = e.target.value ? Number(e.target.value) : null
          const currentCaptainId = this.parent.data.team.captain_id || null
          if (newCaptainId !== currentCaptainId) {
            try {
              await server.setCaptain(newCaptainId)
              this.parent.data.team.captain_id = newCaptainId
              toast(t('myTeam.captainUpdated'), 'success')
              await this.update()
            } catch (err) {
              showServerError(err)
            }
          }
        }
      },
      '.bench-slots': {
        click: (e) => {
          // Don't open the player picker when interacting with the substitution-mode select
          if (e.target.closest('.bench-substitution-mode')) return
          const slot = e.target.closest('.bench-slot')
          if (!slot) return
          this._showBenchPlayerSelect(slot.dataset.benchPosition)
        },
        change: async (e) => {
          const select = e.target.closest('.bench-substitution-mode')
          if (!select) return
          const playerId = Number(select.dataset.playerId)
          const mode = select.value
          if (!playerId) return
          try {
            await server.updateBenchSubstitutionMode(playerId, mode)
            const player = this.parent.data.players.find(p => p.id === playerId)
            if (player) player.bench_substitution_mode = mode
            toast(t('myTeam.benchSubModeUpdated'), 'success')
          } catch (err) {
            showServerError(err)
          }
        }
      },
      '.emblem-viewer': {
        click: () => this._showEmblemEditor()
      },
      '.emblem-header': {
        click: () => this._showEmblemEditor()
      },
      '.team-name-header': {
        click: () => this._showTeamNameEditor()
      }
    }
  }

  onMounted () {
    this._loadBenchPlayerImages()
  }

  onUpdate () {
    this._loadBenchPlayerImages()
  }

  onDestroy () {
    off(this._exchangeEventId)
    off(this._captainClearedEventId)
  }

  /**
   * @returns {PlayerList}
   */
  _createPlayerList () {
    this._playerList = new PlayerList(
      this.parent.data.players.filter(p => !p.fake),
      true,
      p => {
        setQueryParams({
          player_id: p.id
        })
      },
      true,
      true,
      null,
      this.parent.data.team.captain_id || null
    )
    return this._playerList
  }

  /**
   * @returns {string}
   */
  _renderHeader () {
    const realPlayers = this.parent.data.players.filter(p => !p.fake)
    const totalSalary = realPlayers.reduce((sum, p) => sum + getSalary(p.level), 0)
    const totalStrength = realPlayers.reduce((sum, p) => sum + p.level, 0)
    const lineupStrength = this._calculateTeamStrength(this.parent.data.players)
    const avgLevel = realPlayers.length > 0 ? (totalStrength / realPlayers.length).toFixed(1) : 0
    const avgAge = realPlayers.length > 0
      ? (realPlayers.reduce((sum, p) => sum + calculatePlayerAge(p, this.parent.season), 0) / realPlayers.length).toFixed(1)
      : 0

    return `
      <h2 class="team-name-header u-cursor-pointer mb-4 text-center text-lg-start" title="${t('myTeam.clickToEditName')}">
        ${this.parent.data.team.name} <i class="fa fa-pencil" aria-hidden="true"></i>
      </h2>
      <div class="row">
        <div class="col-12 col-md-4 mb-4">
          <div class="card h-100 border-0">
            <div class="card-header text-white gradient-header">
              <h5 class="card-title mb-0">${t('myTeam.teamInfo')}</h5>
            </div>
            <div class="card-body pt-0">
              <table class="table table-sm mb-0 team-info-table">
                <tbody>
                  <tr><td class="text-muted ps-3">${t('myTeam.league')}</td><td class="text-end pe-3">${formatLeague(this.parent.data.team.level, this.parent.data.team.league)}</td></tr>
                  <tr><td class="text-muted ps-3">${t('myTeam.salaryTotal')}</td><td class="text-end pe-3">${euroFormat.format(totalSalary)}</td></tr>
                  <tr><td class="text-muted ps-3">${t('myTeam.avgAge')}</td><td class="text-end pe-3">${avgAge} ${t('myTeam.years')}</td></tr>
                  <tr><td class="text-muted ps-3">${t('myTeam.avgLevel')}</td><td class="text-end pe-3">${avgLevel}</td></tr>
                  <tr><td class="text-muted ps-3">${t('myTeam.totalStrength')}</td><td class="text-end pe-3">${totalStrength}</td></tr>
                  <tr><td class="text-muted ps-3">${t('myTeam.lineupStrength')}</td><td class="text-end pe-3">${lineupStrength}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="col-12 col-md-4 mb-4">
          <div class="card h-100 border-0">
            <div class="card-header text-white gradient-header">
              <h5 class="card-title mb-0 emblem-header u-cursor-pointer" title="${t('myTeam.clickToEditEmblem')}">${t('myTeam.emblem')} <i class="fa fa-pencil" aria-hidden="true"></i></h5>
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
              <div class="form-group mb-3">
              <p class="card-text mb-0">${t('myTeam.choosePlayStyle')}</p>
                ${this._renderPlayStyleSelect()}
              </div>
              <div class="form-group">
              <p class="card-text mb-0">${t('myTeam.chooseAttackMode')}</p>
                ${this._renderAttackModeSelect()}
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
    return `<div class="mb-4 emblem-viewer">
      ${renderEmblem(this.parent.data.team, 200)}
    </div>`
  }

  /**
   * @returns {string}
   */
  _renderLineupSelect () {
    const currentFormation = this.parent.data.team.formation
    return `
      <select class="form-control lineup-select">
        ${Object.values(Formation).map(f => `<option value="${f}" ${f === currentFormation ? 'selected' : ''}>${f}</option>`).join('')}
      </select>
    `
  }

  /**
   * @returns {string}
   */
  _renderPassStyleSelect () {
    const passStyles = ['short', 'mixed', 'long']
    const currentPassStyle = this.parent.data.team.pass_style || 'mixed'
    return `
      <select class="form-control pass-style-select">
        ${passStyles.map(style => `<option value="${style}" ${style === currentPassStyle ? 'selected' : ''}>${t('myTeam.passStyle.' + style)}</option>`).join('')}
      </select>
    `
  }

  /**
   * @returns {string}
   */
  _renderPlayStyleSelect () {
    const playStyles = ['aggressive', 'normal', 'friendly']
    const currentPlayStyle = this.parent.data.team.play_style || 'normal'
    return `
      <select class="form-control play-style-select">
        ${playStyles.map(style => `<option value="${style}" ${style === currentPlayStyle ? 'selected' : ''} title="${t('myTeam.playStyleDesc.' + style)}">${t('myTeam.playStyle.' + style)}</option>`).join('')}
      </select>
    `
  }

  /**
   * @returns {string}
   */
  _renderAttackModeSelect () {
    const attackModes = ['offensive', 'balanced', 'defensive']
    const currentAttackMode = this.parent.data.team.attack_mode || 'balanced'
    return `
      <select class="form-control attack-mode-select">
        ${attackModes.map(mode => `<option value="${mode}" ${mode === currentAttackMode ? 'selected' : ''} title="${t('myTeam.attackModeDesc.' + mode)}">${t('myTeam.attackMode.' + mode)}</option>`).join('')}
      </select>
    `
  }

  /**
   * @returns {string}
   */
  _renderCaptainSelect () {
    const lineupPlayers = this.parent.data.players.filter(p => p.in_game_position && !p.fake)
    const currentCaptainId = this.parent.data.team.captain_id || null
    return `
      <select class="form-control captain-select">
        <option value="">${t('myTeam.captain.none')}</option>
        ${lineupPlayers.map(p => `<option value="${p.id}" ${p.id === currentCaptainId ? 'selected' : ''}>${p.name} (${p.position}, Lvl ${p.level})</option>`).join('')}
      </select>
    `
  }

  /**
   * Position group definitions for bench slots
   */
  _benchSlots = [
    {
      benchPosition: 'BENCH_GK',
      label: 'myTeam.benchGK',
      positions: ['GK']
    },
    {
      benchPosition: 'BENCH_DEF',
      label: 'myTeam.benchDEF',
      positions: ['LD', 'CD', 'RD']
    },
    {
      benchPosition: 'BENCH_MID',
      label: 'myTeam.benchMID',
      positions: ['DM', 'LM', 'CM', 'RM', 'OM']
    },
    {
      benchPosition: 'BENCH_ATT',
      label: 'myTeam.benchATT',
      positions: ['LA', 'CA', 'RA']
    }
  ]

  /**
   * @returns {string}
   */
  _renderBenchSlots () {
    return this._benchSlots.map(slot => {
      const player = this.parent.data.players.find(p => !p.fake && p.bench_position === slot.benchPosition)
      if (!player) {
        return `
          <div class="bench-slot bench-slot--empty u-cursor-pointer" data-bench-position="${slot.benchPosition}">
            <div class="bench-slot__label">${t(slot.label)}</div>
          </div>
        `
      }
      const freshnessPercentage = Math.round(player.freshness * 100)
      const freshnessClass = freshnessPercentage >= 80
        ? 'freshness-success'
        : freshnessPercentage >= 60
          ? 'freshness-warning'
          : freshnessPercentage >= 40
            ? 'freshness-orange'
            : 'freshness-danger'
      const displayName = player.name.includes(' ')
        ? player.name.split(' ')[0][0] + ' ' + (player.name.split(' ')[1] ?? '')
        : player.name
      return `
        <div class="bench-slot ${player.position} u-cursor-pointer" data-bench-position="${slot.benchPosition}" data-player-id="${player.id}">
          <div class="bench-slot__image"></div>
          <div class="bench-slot__info">
            <span class="bench-slot__name">${player.is_suspended ? '🚫 ' : ''}${player.is_injured ? '<i class="fa fa-medkit"></i> ' : ''}${displayName}</span>
            <span class="position-badge ${player.position}">${player.position}</span>
            ${renderLevelBadge(player.level)}
            <span class="bench-slot__freshness ${freshnessClass}">${freshnessPercentage}%</span>
          </div>
          ${this._renderSubstitutionModeSelect(player)}
        </div>
      `
    }).join('')
  }

  /**
   * Render the substitution-mode dropdown for a bench player.
   * @param {object} player
   * @returns {string}
   */
  _renderSubstitutionModeSelect (player) {
    const modes = ['always', 'injury_only', 'leading', 'trailing']
    const current = player.bench_substitution_mode || 'injury_only'
    return `
      <select class="form-select form-select-sm bench-substitution-mode" data-player-id="${player.id}" title="${t('myTeam.benchSubMode')}">
        ${modes.map(mode => `<option value="${mode}" ${mode === current ? 'selected' : ''}>${t('myTeam.benchSubMode.' + mode)}</option>`).join('')}
      </select>
    `
  }

  /**
   * @param {string} benchPosition
   */
  _showBenchPlayerSelect (benchPosition) {
    const slot = this._benchSlots.find(s => s.benchPosition === benchPosition)
    if (!slot) return

    const currentBenchPlayerIds = new Set(
      this.parent.data.players
        .filter(p => !p.fake && p.bench_position && p.bench_position !== benchPosition)
        .map(p => p.id)
    )

    const availablePlayers = this.parent.data.players.filter(p =>
      !p.fake &&
      slot.positions.includes(p.position) &&
      !p.is_suspended &&
      !p.is_injured &&
      !currentBenchPlayerIds.has(p.id)
    )

    const overlay = showOverlay(
      t('myTeam.benchSelect'),
      '',
      `${new PlayerList(
        availablePlayers,
        false,
        async (selectedPlayer) => {
          // Clear old bench assignment for this slot
          for (const p of this.parent.data.players) {
            if (!p.fake && p.bench_position === benchPosition) {
              p.bench_position = null
            }
          }
          // Find the player in data and assign bench
          const player = this.parent.data.players.find(p => p.id === selectedPlayer.id)
          if (player) {
            // Remove from lineup if currently in it
            if (player.in_game_position) {
              player.in_game_position = ''
            }
            player.bench_position = benchPosition
          }
          await this._saveBench()
          // Also save lineup to persist the removal
          const playersToSave = this.parent.data.players.filter(p => !p.fake)
          await server.saveLineup(playersToSave, this.parent.data.team.formation)
          await this.parent.load()
          await this.parent.update()
          setTimeout(() => overlay.remove(), 150)
        }
      )}`
    )
  }

  /**
   * Load player images for bench slots
   */
  _loadBenchPlayerImages () {
    const team = this.parent.data.team
    const benchPlayers = this.parent.data.players.filter(p => !p.fake && p.bench_position)
    benchPlayers.forEach(player => {
      renderPlayerImage(player, team, 100).then(image => {
        const imgEl = document.querySelector(`${this._elementQuery} .bench-slot[data-player-id="${player.id}"] .bench-slot__image`)
        if (imgEl) imgEl.innerHTML = image
      })
    })
  }

  /**
   * Save current bench assignments to server
   */
  async _saveBench () {
    try {
      const benchData = this.parent.data.players
        .filter(p => !p.fake && p.bench_position)
        .map(p => ({
          playerId: p.id,
          benchPosition: p.bench_position,
          substitutionMode: p.bench_substitution_mode || 'injury_only'
        }))
      await server.saveBench(benchData)
      toast(t('myTeam.benchSaved'), 'success')
    } catch (err) {
      showServerError(err)
    }
  }

  /**
   * @param {string} newFormation
   * @returns {void}
   */
  async _changeFormation (newFormation) {
    this.parent.data.team.formation = newFormation
    this.parent.data.players = this.parent.data.players.filter(p => !p.fake)
    this.parent.data.players.forEach(player => {
      player.in_game_position = ''
    })
    const positions = getPositionsOfFormation(newFormation)
    positions.forEach(position => {
      this.parent.data.players.push({
        fake: true,
        in_game_position: position,
        position,
        level: 0,
        name: '-'
      })
    })
    lineUpData.squadDataChanged = true
    await this.update()
  }

  /**
   * @returns {void}
   */
  _showEmblemEditor () {
    // Get current emblem params or defaults
    const currentParams = parseEmblemParams(this.parent.data.team.emblem) || {
      shape: 'shield',
      pattern: 'solid',
      color: this.parent.data.team.color || EMBLEM_COLORS[0],
      color2: EMBLEM_COLORS[1]
    }

    let selectedShape = currentParams.shape
    let selectedPattern = currentParams.pattern
    let selectedColor = currentParams.color
    let selectedColor2 = currentParams.color2 || EMBLEM_COLORS[1]
    // Only offer prefix toggles for prefixes that actually exist in the team name.
    const { prefix1, prefix2 } = splitTeamName(this.parent.data.team.name)
    const hasPrefix1 = !!prefix1
    const hasPrefix2 = !!prefix2
    // The "prefix on emblem" toggle uses prefix1 when available, otherwise prefix2 so
    // 2-part names (e.g. "FC Berlin") can still display their leading prefix on the crest.
    const emblemPrefixLabel = prefix1 || prefix2
    const hasEmblemPrefix = !!emblemPrefixLabel
    let selectedPrefixOnEmblem = hasEmblemPrefix && !!currentParams.prefixOnEmblem
    let selectedPrefix1OnBanner = hasPrefix1 && !!currentParams.prefix1OnBanner
    let selectedPrefix2OnBanner = hasPrefix2 && !!currentParams.prefix2OnBanner

    const previewId = generateId()
    const saveButtonId = generateId()
    const prefixOnEmblemId = generateId()
    const prefix1OnBannerId = generateId()
    const prefix2OnBannerId = generateId()

    const updatePreview = () => {
      const previewEl = el(previewId)
      if (previewEl) {
        previewEl.innerHTML = generateEmblem({
          shape: selectedShape,
          pattern: selectedPattern,
          color: selectedColor,
          color2: selectedColor2,
          prefixOnEmblem: selectedPrefixOnEmblem,
          prefix1OnBanner: selectedPrefix1OnBanner,
          prefix2OnBanner: selectedPrefix2OnBanner,
          teamName: this.parent.data.team.name,
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

    // Color 1 options
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

    // Color 2 options
    const color2Options = EMBLEM_COLORS.map(c => {
      const id = generateId()
      setTimeout(() => {
        const element = el(id)
        if (element) {
          element.addEventListener('click', () => {
            selectedColor2 = c
            document.querySelectorAll('.emblem-editor__color2').forEach(item => {
              item.classList.remove('emblem-editor__color--selected')
            })
            element.classList.add('emblem-editor__color--selected')
            updatePreview()
          })
        }
      }, 100)
      const isSelected = c === selectedColor2
      // Note: background-color must remain inline as it's dynamic per color
      return `
        <div id="${id}" class="emblem-editor__color2 emblem-editor__color ${isSelected ? 'emblem-editor__color--selected' : ''}" style="background-color: ${c};"></div>
      `
    }).join('')

    // Save button handler
    onClick(saveButtonId, async () => {
      try {
        const emblemParams = JSON.stringify({
          shape: selectedShape,
          pattern: selectedPattern,
          color: selectedColor,
          color2: selectedColor2,
          prefixOnEmblem: selectedPrefixOnEmblem,
          prefix1OnBanner: selectedPrefix1OnBanner,
          prefix2OnBanner: selectedPrefix2OnBanner
        })
        await server.updateEmblem(emblemParams, selectedColor)
        toast(t('myTeam.emblemUpdated'), 'success')
        this.parent.data.team.emblem = emblemParams
        this.parent.data.team.color = selectedColor
        await this.parent.update(true)
        overlay.remove()
      } catch (e) {
        showServerError(e)
      }
    })

    // Wire up checkbox listeners after overlay renders.
    const bindCheckbox = (id, setter) => {
      setTimeout(() => {
        const element = el(id)
        if (element) {
          element.addEventListener('change', (e) => {
            setter(e.target.checked)
            updatePreview()
          })
        }
      }, 100)
    }
    if (hasEmblemPrefix) {
      bindCheckbox(prefixOnEmblemId, (v) => { selectedPrefixOnEmblem = v })
    }
    if (hasPrefix1) {
      bindCheckbox(prefix1OnBannerId, (v) => { selectedPrefix1OnBanner = v })
    }
    if (hasPrefix2) {
      bindCheckbox(prefix2OnBannerId, (v) => { selectedPrefix2OnBanner = v })
    }

    const nameDisplaySection = (hasEmblemPrefix || hasPrefix1 || hasPrefix2)
      ? `
      <h6>${t('myTeam.nameDisplay')}</h6>
      <div class="emblem-editor__section emblem-editor__section--toggles mb-4">
        ${hasEmblemPrefix
    ? `<div class="form-check">
          <input class="form-check-input" type="checkbox" id="${prefixOnEmblemId}" ${selectedPrefixOnEmblem ? 'checked' : ''}>
          <label class="form-check-label" for="${prefixOnEmblemId}">${t('myTeam.prefixOnEmblem', { prefix: emblemPrefixLabel })}</label>
        </div>`
    : ''}
        ${hasPrefix1
    ? `<div class="form-check">
          <input class="form-check-input" type="checkbox" id="${prefix1OnBannerId}" ${selectedPrefix1OnBanner ? 'checked' : ''}>
          <label class="form-check-label" for="${prefix1OnBannerId}">${t('myTeam.prefix1OnBanner', { prefix: prefix1 })}</label>
        </div>`
    : ''}
        ${hasPrefix2
    ? `<div class="form-check">
          <input class="form-check-input" type="checkbox" id="${prefix2OnBannerId}" ${selectedPrefix2OnBanner ? 'checked' : ''}>
          <label class="form-check-label" for="${prefix2OnBannerId}">${t('myTeam.prefix2OnBanner', { prefix: prefix2 })}</label>
        </div>`
    : ''}
      </div>`
      : ''

    const overlay = showOverlay(
      t('myTeam.createEmblem'),
      t('myTeam.designEmblem'),
      `
      <div class="emblem-editor__preview">
        <div id="${previewId}">${generateEmblem({
  shape: selectedShape,
  pattern: selectedPattern,
  color: selectedColor,
  color2: selectedColor2,
  prefixOnEmblem: selectedPrefixOnEmblem,
  prefix1OnBanner: selectedPrefix1OnBanner,
  prefix2OnBanner: selectedPrefix2OnBanner,
  teamName: this.parent.data.team.name,
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

      <h6>${t('myTeam.color1')}</h6>
      <div class="emblem-editor__section">
        ${colorOptions}
      </div>

      <h6>${t('myTeam.color2')}</h6>
      <div class="emblem-editor__section mb-4">
        ${color2Options}
      </div>

      ${nameDisplaySection}

      <button id="${saveButtonId}" class="btn btn-primary w-100">${t('myTeam.saveEmblem')}</button>
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
    const currentName = this.parent.data.team.name
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
      `<option value="${escapeHtml(p)}" ${p === selectedPrefix2 ? 'selected' : ''}>${escapeHtml(p) || '(none)'}</option>`
    ).join('')

    const sortedCityNames = [...cityNames].sort((a, b) => a.localeCompare(b))
    let currentLetter = ''
    const cityOptions = sortedCityNames.map(c => {
      const firstLetter = c.charAt(0).toUpperCase()
      let divider = ''
      if (firstLetter !== currentLetter) {
        currentLetter = firstLetter
        divider = `<option disabled>── ${firstLetter} ──</option>`
      }
      return `${divider}<option value="${escapeHtml(c)}" ${c === selectedCity ? 'selected' : ''}>${escapeHtml(c)}</option>`
    }).join('')

    // Add change listeners via global event helper (overlay is outside component DOM)
    const onChangeEl = (query, handler) => {
      setTimeout(() => {
        const element = el(query)
        if (element) element.addEventListener('change', handler)
      })
    }
    onChangeEl(prefix1SelectId, updatePreview)
    onChangeEl(prefix2SelectId, updatePreview)
    onChangeEl(citySelectId, updatePreview)

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
        this.parent.data.team.name = newName
        await this.parent.update(true)
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
