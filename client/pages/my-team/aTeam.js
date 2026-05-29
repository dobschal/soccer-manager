import { Formation, getPositionsOfFormation } from '../../util/formation.js'
import { server, showServerError } from '../../lib/gateway.js'
import { showOverlay } from '../../partials/overlay.js'
import { PlayerList } from '../../partials/playerList.js'
import { toast } from '../../partials/toast.js'
import { renderPlayerImage } from '../../partials/playerImage.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'
import { setQueryParams } from '../../lib/router.js'
import { sortByPosition } from '../../util/player.js'
import { Lineup, lineUpData } from '../../partials/lineup.js'
import { fire, off, on } from '../../lib/event.js'
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
      // Strip fake placeholders before storing — only the Lineup component
      // cares about them, and keeping them in parent.data.players would let
      // them sneak back into a freshly-rendered Lineup and fight real players
      // for slots on the next re-render.
      const realPlayers = updatedPlayers.filter(p => !p.fake)
      this.parent.data.players = realPlayers
      if (this._playerList) {
        this._playerList.players = realPlayers.slice().sort(sortByPosition)
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
        <h3>${t('myTeam.lineup')}</h3>
        <div class="mb-4" id="squad">
          ${new Lineup(this.parent.data.players, this.parent.data.team)}
        </div>
        <div class="mb-4">
          <h3>${t('myTeam.bench')}</h3>
          <div class="bench-slots d-flex gap-3 flex-wrap" id="bench">
            ${this._renderBenchSlots()}
          </div>
          <div class="alert alert-info mt-3 mb-0">
            <i class="fa fa-info-circle me-1"></i> ${t('myTeam.benchSubInfo')}
          </div>
        </div>
        <div class="mb-4">
          <h3>${t('myTeam.tactic')}</h3>
          <div class="row">
            ${this._renderTacticSelects()}
          </div>
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
  _renderTacticSelects () {
    const items = [
      { label: t('myTeam.chooseLineup'), select: this._renderLineupSelect() },
      { label: t('myTeam.choosePassStyle'), select: this._renderPassStyleSelect() },
      { label: t('myTeam.choosePlayStyle'), select: this._renderPlayStyleSelect() },
      { label: t('myTeam.chooseAttackMode'), select: this._renderAttackModeSelect() },
      { label: t('myTeam.chooseCaptain'), select: this._renderCaptainSelect() }
    ]
    return items.map(({ label, select }) => `
      <div class="col-12 col-lg-6 mb-3">
        <label class="form-label mb-1">${label}</label>
        ${select}
      </div>
    `).join('')
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
    const realPlayers = this.parent.data.players
    const usedPlayerIds = new Set()
    const unfilledPositions = []
    for (const position of positions) {
      const candidate = this._pickBestPlayerForPosition(position, realPlayers, usedPlayerIds)
      if (candidate) {
        candidate.in_game_position = position
        if (candidate.bench_position) candidate.bench_position = null
        usedPlayerIds.add(candidate.id)
      } else {
        unfilledPositions.push(position)
      }
    }
    unfilledPositions.forEach(position => {
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
    await this._saveLineupAfterFormationChange()
  }

  /**
   * Pick the best matching player for a position. Priority: freshness > level
   * when freshness differs by more than 0.2, otherwise level > freshness.
   * Mirrors the bot logic in server/bot-move.js:_checkTactic.
   *
   * @param {string} position
   * @param {Array} players
   * @param {Set<number>} usedPlayerIds
   * @returns {object|null}
   */
  _pickBestPlayerForPosition (position, players, usedPlayerIds) {
    let best = null
    for (const player of players) {
      if (usedPlayerIds.has(player.id)) continue
      if (player.position !== position) continue
      if (player.is_suspended || player.is_injured) continue
      if (!best) { best = player; continue }
      const a = player.freshness ?? 0
      const b = best.freshness ?? 0
      const diff = a - b
      if (diff > 0.2) {
        best = player
      } else if (diff >= -0.2) {
        if (player.level > best.level) best = player
        else if (player.level === best.level && a > b) best = player
      }
    }
    return best
  }

  /**
   * Persist lineup and bench after an auto-fill formation change.
   * @returns {Promise<void>}
   */
  async _saveLineupAfterFormationChange () {
    const realPlayers = this.parent.data.players.filter(p => !p.fake)
    if (!realPlayers.some(p => p.in_game_position)) return
    try {
      const result = await server.saveLineup(realPlayers, this.parent.data.team.formation)
      if (result?.captainCleared) {
        this.parent.data.team.captain_id = null
        fire('captain-cleared')
      }
      const benchData = realPlayers
        .filter(p => p.bench_position)
        .map(p => ({
          playerId: p.id,
          benchPosition: p.bench_position,
          substitutionMode: p.bench_substitution_mode || 'injury_only'
        }))
      await server.saveBench(benchData)
      toast(t('myTeam.lineupAutoFilled'), 'success')
      lineUpData.squadDataChanged = false
    } catch (err) {
      showServerError(err)
    }
  }

  /**
   * @param {Array} players
   * @returns {number}
   */
  _calculateTeamStrength (players) {
    return players.filter(p => p.in_game_position).reduce((sum, player) => sum + player.level, 0)
  }
}
