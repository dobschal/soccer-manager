import { Formation, getPositionsOfFormation } from '../../util/formation.js'
import { server, showServerError } from '../../lib/gateway.js'
import { showOverlay } from '../../partials/overlay.js'
import { PlayerList } from '../../partials/playerList.js'
import { toast } from '../../partials/toast.js'
import { setQueryParams } from '../../lib/router.js'
import { sortByPosition } from '../../util/player.js'
import { Lineup, lineUpData } from '../../partials/lineup.js'
import { BenchSlot } from '../../partials/benchSlot.js'
import { CaptainSelect } from '../../partials/captainSelect.js'
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
        <h3>${t('myTeam.lineup')} ${wikiInfoIcon('lineup')}</h3>
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
          <h3>${t('myTeam.tactic')} ${wikiInfoIcon('tactics')}</h3>
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

  onMounted () {
    window.addEventListener('player-updated', this._onPlayerUpdated)
  }

  onDestroy () {
    off(this._exchangeEventId)
    off(this._captainClearedEventId)
    window.removeEventListener('player-updated', this._onPlayerUpdated)
  }
  /**
   * When an action card changes a player's level/freshness in the PlayerModal,
   * patch the matching player in our squad data and re-render so the player
   * list, lineup and bench reflect the new values.
   * @param {CustomEvent} event
   * @returns {void}
   */
  _onPlayerUpdated = (event) => {
    const updated = event.detail?.player
    if (!updated) return
    const player = this.parent.data.players.find(p => !p.fake && p.id === updated.id)
    if (!player) return
    player.level = updated.level
    player.freshness = updated.freshness
    this.update()
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
