import { Formation, getPositionsOfFormation } from '../../util/formation.js'
import { server, showServerError } from '../../lib/gateway.js'
import { showConfirmDialog, showOverlay } from '../../partials/overlay.js'
import { el, generateId } from '../../lib/html.js'
import { PlayerList } from '../../partials/playerList.js'
import { toast } from '../../partials/toast.js'
import { setQueryParams } from '../../lib/router.js'
import { sortByPosition } from '../../util/player.js'
import { Lineup } from '../../partials/lineup.js'
import { BenchSlot } from '../../partials/benchSlot.js'
import { CaptainSelect } from '../../partials/captainSelect.js'
import { SpyReportCard } from '../../partials/spyReportCard.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'
import { fire, off, on } from '../../lib/event.js'
import { t } from '../../i18n/index.js'
import { UIElement } from '../../lib/UIElement.js'
import { wikiInfoIcon } from '../../partials/wikiInfoIcon.js'

export class ATeamPage extends UIElement {

  /**
   * @param {import('../my-team.js').MyTeamPage} parent
   */
  constructor (parent) {
    super()
    this.parent = parent
    this._playerList = null
    this._spyReportCard = null
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
   * Load the saved lineup slots (#481). Kept on this page rather than on the
   * parent so the other tabs don't pay for a request they never use.
   * @returns {Promise<void>}
   */
  async load () {
    try {
      const result = await server.getMyLineups()
      this._lineups = result.lineups
      this._activeLineupId = result.activeId
    } catch {
      // A failure here must not take the whole squad page down — the lineup
      // picker just stays hidden.
      this._lineups = []
      this._activeLineupId = null
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <h3>${t('myTeam.lineup')} ${wikiInfoIcon('lineup')}</h3>
        ${this._renderLineupManager()}
        ${this._renderMotivatingSpeechBanner()}
        <div class="mb-4" id="squad">
          ${new Lineup(this.parent.data.players, this.parent.data.team, this.parent.season)}
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
          <h3>${t('myTeam.tactic')} ${wikiInfoIcon('tactics')}</h3>
          <div class="row">
            ${this._renderTacticSelects()}
          </div>
          ${this._getSpyReportCard()}
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
      '(optional).lineup-slot-select': {
        change: async (e) => {
          const lineupId = Number(e.target.value)
          if (lineupId === this._activeLineupId) return
          try {
            const result = await server.activateMyLineup(lineupId)
            this._lineups = result.lineups
            this._activeLineupId = result.activeId
            await this._reloadAfterLineupChange()
            toast(t('myTeam.lineupActivated'), 'success')
          } catch (err) {
            showServerError(err)
          }
        }
      },
      '(optional).lineup-slot-new-btn': {
        click: () => this._showNewLineupOverlay()
      },
      '(optional).lineup-slot-rename-btn': {
        click: () => this._showRenameLineupOverlay()
      },
      '(optional).lineup-slot-delete-btn': {
        click: async () => {
          const active = this._lineups.find(l => l.id === this._activeLineupId)
          const confirmed = await showConfirmDialog(
            t('myTeam.deleteLineupConfirm', { name: active?.name ?? '' }),
            t('myTeam.deleteLineup'),
            t('common.cancel')
          )
          if (!confirmed) return
          try {
            const result = await server.deleteMyLineup(this._activeLineupId)
            this._lineups = result.lineups
            this._activeLineupId = result.activeId
            await this._reloadAfterLineupChange()
            toast(t('myTeam.lineupDeleted'), 'success')
          } catch (err) {
            showServerError(err)
          }
        }
      },
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
      '.bench-slots': {
        // Delegated click: opens the player picker for the clicked slot. The
        // substitution-mode select lives inside the slot but has its own
        // change handler on BenchSlot — stop the click from bubbling into
        // the overlay open.
        click: (e) => {
          if (e.target.closest('.bench-substitution-mode')) return
          const slot = e.target.closest('.bench-slot')
          if (!slot) return
          this._showBenchPlayerSelect(slot.dataset.benchPosition)
        }
      }
    }
  }
  /**
   * Own the source-of-truth mutation for `parent.data.players` when a bench
   * pick lands. Every child UIElement (Lineup, PlayerListItem, CaptainSelect,
   * BenchSlot) also subscribes and handles its own visual update — this
   * handler just keeps the shared data behind them consistent so a later
   * full re-render (tab switch, formation change) reads correct state.
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      [SERVER_EVENTS.BENCH_CHANGED.name]: (data) => {
        if (!data?.player) return
        const players = this.parent.data.players
        const picked = players.find(p => !p.fake && p.id === data.player.id)
        if (picked) {
          picked.bench_position = data.benchPosition
          if (data.vacatedLineupPosition) picked.in_game_position = ''
        }
        if (data.displacedPlayerId) {
          const displaced = players.find(p => !p.fake && p.id === data.displacedPlayerId)
          if (displaced) displaced.bench_position = null
        }
      },
      [SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]: (data) => {
        if (!data) return
        const players = this.parent.data.players
        Object.entries(data.slots ?? {}).forEach(([slot, playerData]) => {
          const p = players.find(x => !x.fake && x.id === playerData.id)
          if (!p) return
          p.in_game_position = slot
          p.bench_position = null
        })
        if (data.ejectedPlayerId) {
          const ejected = players.find(p => !p.fake && p.id === data.ejectedPlayerId)
          if (ejected) ejected.in_game_position = ''
        }
      }
    }
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
   * Lazy-init and cache the spy-report card so a parent re-render (formation
   * change, lineup exchange) reuses the same instance instead of re-fetching
   * and flickering.
   * @returns {SpyReportCard}
   */
  _getSpyReportCard () {
    if (!this._spyReportCard) this._spyReportCard = new SpyReportCard()
    return this._spyReportCard
  }

  /**
   * Lineup slot picker (#481): a select for the active saved lineup plus a
   * button to create a new, empty one. Rendered empty until `load()` on the
   * parent page has filled `_lineups`.
   * @returns {string}
   */
  _renderLineupManager () {
    if (!this._lineups || this._lineups.length === 0) return ''
    const canDelete = this._lineups.length > 1
    return `
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <select class="form-select form-select-sm lineup-slot-select u-max-w-240">
          ${this._lineups.map(l => `
            <option value="${l.id}" ${l.id === this._activeLineupId ? 'selected' : ''}>${l.name}</option>
          `).join('')}
        </select>
        <button type="button" class="btn btn-sm btn-outline-info lineup-slot-rename-btn" title="${t('myTeam.renameLineup')}">
          <i class="fa fa-pencil" aria-hidden="true"></i>
        </button>
        <button type="button" class="btn btn-sm btn-outline-info lineup-slot-new-btn">
          <i class="fa fa-plus" aria-hidden="true"></i> ${t('myTeam.newLineup')}
        </button>
        ${canDelete
    ? `<button type="button" class="btn btn-sm btn-outline-danger lineup-slot-delete-btn" title="${t('myTeam.deleteLineup')}">
              <i class="fa fa-trash" aria-hidden="true"></i>
            </button>`
    : ''}
      </div>
    `
  }

  /**
   * Reload the whole team (players, formation, tactics, captain) after the
   * active lineup changed server-side, then re-render this page.
   * @returns {Promise<void>}
   */
  async _reloadAfterLineupChange () {
    await this.parent.load()
    this._playerList = null
    await this.update()
  }

  /**
   * Ask for a name, then create a new empty lineup and switch to it.
   * @returns {Promise<void>}
   */
  _showNewLineupOverlay () {
    this._showLineupNameOverlay({
      title: t('myTeam.newLineup'),
      hint: t('myTeam.newLineupHint'),
      submitLabel: t('myTeam.createLineup'),
      value: '',
      onSubmit: async (name) => {
        const result = await server.createMyLineup(name)
        this._lineups = result.lineups
        this._activeLineupId = result.activeId
        await this._reloadAfterLineupChange()
        toast(t('myTeam.lineupCreated'), 'success')
      }
    })
  }

  /**
   * Rename the lineup currently picked in the slot select (#481). Every lineup
   * can be renamed, including the seeded default one — the select is always in
   * sync with the active lineup, so that is the one we edit.
   * @returns {void}
   */
  _showRenameLineupOverlay () {
    const lineupId = Number(el('.lineup-slot-select')?.value) || this._activeLineupId
    const lineup = this._lineups?.find(l => l.id === lineupId)
    if (!lineup) return
    this._showLineupNameOverlay({
      title: t('myTeam.renameLineup'),
      hint: t('myTeam.renameLineupHint'),
      submitLabel: t('myTeam.saveLineupName'),
      value: lineup.name,
      onSubmit: async (name) => {
        if (name === lineup.name) return
        const result = await server.renameMyLineup(lineupId, name)
        this._lineups = result.lineups
        this._activeLineupId = result.activeId ?? this._activeLineupId
        await this.update()
        toast(t('myTeam.lineupRenamed'), 'success')
      }
    })
  }

  /**
   * Shared name prompt for creating and renaming a lineup. Closes the overlay
   * before running `onSubmit` so a server error surfaces on the page rather
   * than behind the overlay.
   * @param {{title: string, hint: string, submitLabel: string, value: string,
   *   onSubmit: (name: string) => Promise<void>}} options
   * @returns {void}
   */
  _showLineupNameOverlay ({ title, hint, submitLabel, value, onSubmit }) {
    const inputId = generateId()
    const submitId = generateId()
    const overlay = showOverlay(
      title,
      hint,
      `
        <input type="text" id="${inputId}" class="form-control mb-3"
               maxlength="40" placeholder="${t('myTeam.lineupNamePlaceholder')}">
        <button id="${submitId}" class="btn btn-info w-100">
          <i class="fa fa-check" aria-hidden="true"></i> ${submitLabel}
        </button>
      `
    )
    setTimeout(() => {
      const input = document.getElementById(inputId)
      const submit = document.getElementById(submitId)
      if (input && value) {
        // Assigned rather than rendered into the attribute so a name with
        // quotes or angle brackets cannot break out of the markup.
        input.value = value
      }
      input?.focus()
      input?.select()
      const save = async () => {
        const name = input?.value.trim() || ''
        if (!name) {
          toast(t('myTeam.lineupNameRequired'), 'error')
          return
        }
        overlay.remove()
        try {
          await onSubmit(name)
        } catch (err) {
          showServerError(err)
        }
      }
      submit?.addEventListener('click', save)
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save()
      })
    }, 0)
  }

  /**
   * Banner above the lineup showing that a Motivating Speech action card is
   * active for the next match day, so the user can see the buff without
   * opening the action-cards page (#514).
   * @returns {string}
   */
  _renderMotivatingSpeechBanner () {
    if (!this.parent.data.team?.motivating_speech_active) return ''
    return `
      <div class="alert alert-info d-flex align-items-center gap-2 mb-3">
        <i class="fa fa-bullhorn" aria-hidden="true"></i>
        <span>${t('myTeam.motivatingSpeechActive')}</span>
      </div>
    `
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
      { label: t('myTeam.chooseCaptain'), select: `${new CaptainSelect(this.parent.data.players, this.parent.data.team, this.parent.season)}` }
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

  /** Saved lineup slots and which one is currently loaded (#481). */
  _lineups = []
  _activeLineupId = null

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
      const player = this.parent.data.players.find(p => !p.fake && p.bench_position === slot.benchPosition) ?? null
      return `${new BenchSlot(slot.benchPosition, t(slot.label), player, this.parent.data.team)}`
    }).join('')
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
      !p.tour_days_left &&
      !currentBenchPlayerIds.has(p.id)
    )

    const overlay = showOverlay(
      t('myTeam.benchSelect'),
      '',
      `${new PlayerList(
        availablePlayers,
        false,
        async (selectedPlayer) => {
          try {
            // Single atomic call — server clears the old slot occupant,
            // pulls the player out of the lineup if needed, clears captain
            // when applicable, and emits BENCH_CHANGED / CAPTAIN_CHANGED.
            // Every affected UIElement updates itself off those events;
            // this handler doesn't need to touch local state or re-render.
            await server.assignBenchPlayer(selectedPlayer.id, benchPosition)
            toast(t('myTeam.benchSaved'), 'success')
          } catch (err) {
            showServerError(err)
          }
          setTimeout(() => overlay.remove(), 150)
        }
      )}`
    )
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
      if (player.is_suspended || player.is_injured || player.tour_days_left) continue
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
