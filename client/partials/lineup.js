import { UIElement } from '../lib/UIElement.js'
import { toast } from './toast.js'
import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { SelectPlayerOverlay } from './selectPlayerOverlay.js'
import { renderPlayerImage } from './playerImage.js'
import { getPositionsOfFormation } from '../util/formation.js'
import { deepCopy } from '../lib/deepCopy.js'
import { renderLevelBadge } from './levelBadge.js'
import { fire } from '../lib/event.js'
import { t } from '../i18n/index.js'
import { SERVER_EVENTS } from '../lib/serverEvents.js'

export const lineUpData = {
  squadDataChanged: false
}

// Same-position slot offsets that used to be applied post-mount via
// _applyPositionHacks. Precomputing at render time lets each SquadPlayer own
// its own `--lineup-offset` style and stay independent of when the others
// mount, so an atomic re-render of a single tile doesn't disturb neighbors.
const SIDE_BY_SIDE_OFFSETS = {
  2: ['38%', '62%'],
  3: ['32%', '50%', '68%']
}
const SIDE_BY_SIDE_POSITIONS = new Set(['CM', 'CD', 'DM'])

/**
 * One tile on the lineup pitch. Owns its own `<div class="player">` so it can
 * subscribe to `CAPTAIN_CHANGED` and swap the captain badge in place, without
 * forcing the whole Lineup to re-render (which would tear down every other
 * tile's player image and click state).
 */
export class SquadPlayer extends UIElement {
  /**
   * @param {PlayerType & { fake?: boolean }} player
   * @param {TeamType} team - Shared reference; the captain field is kept in sync by Lineup.
   * @param {string} lineupOffset - Precomputed CSS value for `--lineup-offset`
   *   when multiple players share the same in_game_position, or '' if none.
   */
  constructor (player, team, lineupOffset = '') {
    super()
    this.player = player
    this.team = team
    this.lineupOffset = lineupOffset
    // Freeze the slot at construction time. Handlers on Lineup / other
    // sources may mutate `player.in_game_position` (same shared reference),
    // but the tile's physical slot on the pitch never moves — using a
    // separate field keeps rendering and event filtering consistent.
    this.slot = player.in_game_position
    this._isCaptain = !player.fake && player.id === team.captain_id
  }

  /**
   * @returns {string}
   */
  get template () {
    const player = this.player
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
    // Use player ID for real players, or 'fake-{slot}' for empty slots.
    const playerId = player.fake ? `fake-${this.slot}` : player.id
    const isSuspended = player.is_suspended
    const isInjured = player.is_injured
    const inlineStyles = [
      (isSuspended || isInjured) ? 'opacity: 0.5; filter: grayscale(100%);' : '',
      this.lineupOffset ? `--lineup-offset: ${this.lineupOffset};` : ''
    ].filter(Boolean).join(' ')

    // `player.position` is the natural position; `this.slot` is where they're
    // fielded. Compare the two for the out-of-position red ring.
    const isOutOfPosition = !player.fake && player.position !== this.slot
    const badgeClass = `position-badge ${this.slot}${isOutOfPosition ? ' is-wrong-position' : ''}`

    return `
      <div class="player ${this.slot}" data-player-id="${playerId}" style="${inlineStyles}">
        <span class="${badgeClass}">${this.slot}</span>
        <span class="freshness-badge ${freshnessClass}">
            ${player.fake ? '-' : Math.floor(player.freshness * 100) + '%'}
        </span>
        <span class="name">${isSuspended ? '🚫 ' : ''}${isInjured ? '<i class="fa fa-medkit"></i> ' : ''}${displayName}</span>
        ${renderLevelBadge(player.level, { size: 'lg' })}
      </div>
    `
  }
  /**
   * The captain badge is baked into the player image, so a captain change on
   * this tile has to fully re-render the tile (template + image reload). A
   * change that doesn't touch this tile (a different player became captain)
   * is a no-op — its own SquadPlayer handles the incoming badge separately.
   *
   * `BENCH_CHANGED` handles the case where the tile's player was moved to the
   * bench — the tile turns into a fake placeholder in place, so the pitch
   * still shows the slot but with the empty-slot layout.
   *
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      [SERVER_EVENTS.CAPTAIN_CHANGED.name]: (data) => {
        if (this.player.fake) return
        const nowCaptain = (data?.captainId ?? null) === this.player.id
        if (this._isCaptain === nowCaptain) return
        this._isCaptain = nowCaptain
        this.update()
      },
      [SERVER_EVENTS.BENCH_CHANGED.name]: (data) => {
        if (this.player.fake) return
        if (data?.player?.id !== this.player.id) return
        if (!data.vacatedLineupPosition) return
        // My player just got moved from the lineup to the bench — turn this
        // tile into a fake placeholder for the slot we own.
        this.player = this._buildFakePlayer()
        this._isCaptain = false
        this.update()
      },
      [SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]: (data) => {
        if (!data) return
        // Look up who's at MY slot now. `this.slot` is frozen in the
        // constructor, so it can't drift even if the Lineup handler (which
        // fires before this one) already mutated the shared player object's
        // in_game_position.
        const newOccupant = data.slots?.[this.slot] ?? null
        if (newOccupant) {
          if (!this.player.fake && this.player.id === newOccupant.id) return
          this.player = newOccupant
          this._isCaptain = !newOccupant.fake && newOccupant.id === this.team.captain_id
          this.update()
          return
        }
        // No new occupant. Two remaining reasons to turn into a fake: my
        // player was ejected from the lineup, or the swap emptied my slot
        // (picked player came from here and no one replaced them).
        if (this.player.fake) return
        const wasEjected = data.ejectedPlayerId === this.player.id
        const wasEmptied = data.emptiedSlot === this.slot
        if (!wasEjected && !wasEmptied) return
        this.player = this._buildFakePlayer()
        this._isCaptain = false
        this.update()
      }
    }
  }

  onMounted () {
    this._loadImage()
  }
  onUpdate () {
    this._loadImage()
  }
  /**
   * @returns {object}
   * @private
   */
  _buildFakePlayer () {
    return {
      fake: true,
      in_game_position: this.slot,
      position: this.slot,
      level: 0,
      name: '-'
    }
  }

  /**
   * @private
   */
  _loadImage () {
    if (this.player.fake) return
    renderPlayerImage(this.player, this.team, 100, { isCaptain: this._isCaptain }).then(image => {
      const el = document.querySelector(this._elementQuery)
      // The image is prepended to the tile div; onUpdate() replaces the div
      // wholesale, so we don't have to strip a stale image first.
      el?.insertAdjacentHTML('afterbegin', image)
    })
  }
}

export class Lineup extends UIElement {
  /**
   * @param {PlayerType[]} players
   * @param {TeamType} team
   * @param {UIElement} parentInstance
   */
  constructor (players, team) {
    super()
    // Drop any fake placeholders that came in with the input. Lineup is often
    // re-rendered after firing 'lineup-exchange' with `this.players`, which
    // includes the fakes added by the previous _fillEmptyPositions run. If we
    // kept them, the new _fillEmptyPositions would race them against the real
    // players for slots — and depending on array order, a leftover fake could
    // claim a slot first and silently kick the real player into the reserves.
    this.players = deepCopy(players).filter(p => !p.fake)
    this.team = team
    this._fillEmptyPositions()
  }

  /**
   * @returns {string}
   */
  get template () {
    const lineupStrength = this.players
      .filter(p => p.in_game_position && !p.fake)
      .reduce((sum, p) => sum + p.level, 0)
    const offsets = this._computeLineupOffsets()
    return `
      <div class="lineup-container">
        <div class="card bg-dark lineup-pitch">
          <div class="squad card-body">
            <span class="lineup-strength-overlay">${lineupStrength}</span>
            ${this.players.filter(p => p.in_game_position).map(p =>
    `${new SquadPlayer(p, this.team, offsets.get(p) ?? '')}`
  ).join('')}
          </div>
        </div>
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.squad': {
        click: (event) => {
          const playerEl = event.target.closest('.player')
          if (!playerEl) return

          const playerId = playerEl.dataset.playerId
          const player = playerId.startsWith('fake-')
            ? this.players.find(p => p.fake && p.in_game_position === playerId.replace('fake-', ''))
            : this.players.find(p => p.id === Number(playerId))

          if (player) {
            // Matching-position players excluding suspended/injured/fake
            const availablePlayers = this.players.filter(p => p.position === player.in_game_position && !p.fake && !p.is_suspended && !p.is_injured)
            // All players (any position) the user could field for this slot.
            // Excludes the player already in the slot, fake placeholders, and unavailable players.
            const allPlayers = this.players.filter(p => !p.fake && !p.is_suspended && !p.is_injured && p.id !== player.id)
            const positionTitle = t(`position.full.${player.in_game_position}`)
            this._overlay = showOverlay(
              positionTitle,
              '',
              `${new SelectPlayerOverlay(
                player,
                availablePlayers,
                newPlayer => this._exchangePlayer(player, newPlayer),
                () => this._refreshAfterActionCard(),
                allPlayers
              )}`
            )
          }
        }
      }
    }
  }

  /**
   * Keep local state in sync with server events without re-rendering the
   * whole lineup. Each SquadPlayer handles the visible change atomically —
   * Lineup only tracks the shared array so its click handler (which needs to
   * know the current squad shape) stays correct.
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      [SERVER_EVENTS.CAPTAIN_CHANGED.name]: (data) => {
        this.team.captain_id = data?.captainId ?? null
      },
      [SERVER_EVENTS.BENCH_CHANGED.name]: (data) => {
        if (!data?.player || !data.vacatedLineupPosition) return
        // Player moved lineup → bench. Update local players so the click
        // handler builds the right swap-list next time. SquadPlayer tiles
        // handle the visual re-render themselves.
        const player = this.players.find(p => !p.fake && p.id === data.player.id)
        if (!player) return
        player.in_game_position = ''
        player.bench_position = data.benchPosition
        // Insert a fake placeholder for the freshly-vacated slot so a later
        // click on that empty tile still resolves to something in the
        // players array (the click handler looks up fakes by position).
        this.players.push({
          fake: true,
          in_game_position: data.vacatedLineupPosition,
          position: data.vacatedLineupPosition,
          level: 0,
          name: '-'
        })
      },
      [SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]: (data) => {
        if (!data) return
        // Apply new slot assignments to the real player objects. Each
        // SquadPlayer replaces its own `this.player` ref off the event too,
        // so this mutation stays isolated to Lineup's `this.players` array
        // — no shared-ref races with tiles.
        Object.entries(data.slots ?? {}).forEach(([slot, playerData]) => {
          const p = this.players.find(x => !x.fake && x.id === playerData.id)
          if (!p) return
          p.in_game_position = slot
          p.bench_position = null
        })
        if (data.ejectedPlayerId) {
          const ejected = this.players.find(p => !p.fake && p.id === data.ejectedPlayerId)
          if (ejected) ejected.in_game_position = ''
        }
        // `emptiedSlot` is a swap-with-empty case: the picked player was in
        // the lineup and their old slot has no new occupant. The player
        // object already has its new slot set via the loop above, so we
        // just rebuild fakes to add a placeholder for the emptied slot.
        this._rebuildFakes()
      }
    }
  }

  onMounted () {
    void this._autoCleanupIfNeeded()
  }

  _overlay = null
  _needsAutoCleanup = false

  /**
   * Match each lineup player to a slot in the current formation. The slot only
   * needs to exist in the formation — playing out of natural position is
   * allowed (with the in-game level penalty), so we no longer require
   * `p.position === p.in_game_position`. Anything that can't be matched
   * (formation changed away from the slot, duplicate slot) gets cleared and
   * `_autoCleanupIfNeeded` persists the cleaned state.
   * @returns {void}
   */
  _fillEmptyPositions () {
    const positions = getPositionsOfFormation(this.team.formation)
    // Skip fakes — only real players claim slots. Constructor already strips
    // incoming fakes, this is a belt-and-suspenders guard.
    this.players.filter(p => p.in_game_position && !p.fake).forEach(p => {
      const index = positions.findIndex(po => po === p.in_game_position)
      if (index === -1) {
        p.in_game_position = ''
        this._needsAutoCleanup = true
        return
      }
      positions.splice(index, 1)
    })
    positions.forEach(position => {
      this.players.push({
        fake: true,
        in_game_position: position,
        position,
        level: 0,
        name: '-'
      })
    })
  }

  /**
   * If _fillEmptyPositions cleared invalid lineup assignments, persist the
   * cleaned lineup and let the parent component re-sync its player list.
   * @returns {Promise<void>}
   */
  async _autoCleanupIfNeeded () {
    if (!this._needsAutoCleanup) return
    this._needsAutoCleanup = false
    fire('lineup-exchange', this.players)
    await this._autoSaveIfComplete()
  }

  /**
   * @returns {boolean}
   */
  _allowedToSave () {
    const playersInLineup = this.players.filter(p => p.in_game_position && !p.fake)
    return playersInLineup.length > 0
  }

  /**
   * Auto-save the lineup if it's complete
   * @returns {Promise<void>}
   */
  async _autoSaveIfComplete () {
    if (!this._allowedToSave()) return

    try {
      const playersToSave = this.players.filter(p => !p.fake)
      const result = await server.saveLineup(playersToSave, this.team.formation)
      if (result.captainCleared) {
        this.team.captain_id = null
        fire('captain-cleared')
      }
      // Also save bench to persist any bench_position changes
      const benchData = playersToSave
        .filter(p => p.bench_position)
        .map(p => ({
          playerId: p.id,
          benchPosition: p.bench_position
        }))
      await server.saveBench(benchData)
      toast('Lineup saved.', 'success')
      lineUpData.squadDataChanged = false
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    }
  }

  /**
   * Precompute `--lineup-offset` values for positions where the current
   * formation puts multiple players side-by-side (CM/CD/DM). Handing the
   * value to each SquadPlayer as a constructor arg lets each tile own its own
   * inline style — no post-mount DOM sweep needed, so an atomic re-render of
   * one tile can't disturb the offsets of its neighbors.
   * @returns {Map<PlayerType, string>}
   */
  _computeLineupOffsets () {
    const offsets = new Map()
    const byPosition = new Map()
    for (const player of this.players.filter(p => p.in_game_position)) {
      if (!SIDE_BY_SIDE_POSITIONS.has(player.in_game_position)) continue
      if (!byPosition.has(player.in_game_position)) byPosition.set(player.in_game_position, [])
      byPosition.get(player.in_game_position).push(player)
    }
    for (const players of byPosition.values()) {
      const layout = SIDE_BY_SIDE_OFFSETS[players.length]
      if (!layout) continue
      players.forEach((player, i) => offsets.set(player, layout[i]))
    }
    return offsets
  }

  /**
   * After an action card has been applied to a player from inside the overlay,
   * refetch the team so updated player stats (freshness/level) flow back into
   * the parent component and the lineup re-renders. The overlay stays open so
   * the user can apply additional cards to the same player; returning the
   * refreshed roster lets the overlay re-point its own player references at
   * the fresh objects before re-rendering.
   * @returns {Promise<{ players: PlayerType[] } | undefined>}
   */
  async _refreshAfterActionCard () {
    try {
      const refreshedData = await server.getMyTeam()
      fire('lineup-exchange', refreshedData.players)
      return { players: refreshedData.players }
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    }
  }

  /**
   * Drop all fake placeholders and add a fresh set for whatever formation
   * slots are still unfilled. Called by handlers that reshape `this.players`
   * without re-rendering the whole Lineup (BENCH_CHANGED, LINEUP_PLAYER_CHANGED)
   * so the click router still finds a valid entry for every empty tile.
   * @private
   */
  _rebuildFakes () {
    this.players = this.players.filter(p => !p.fake)
    const slots = getPositionsOfFormation(this.team.formation)
    this.players.filter(p => p.in_game_position).forEach(p => {
      const index = slots.findIndex(po => po === p.in_game_position)
      if (index !== -1) slots.splice(index, 1)
    })
    slots.forEach(position => {
      this.players.push({
        fake: true,
        in_game_position: position,
        position,
        level: 0,
        name: '-'
      })
    })
  }

  /**
   * Ask the server to put `newPlayer` into `player`'s slot. The server does
   * the full atomic swap (lineup ↔ lineup swap, bring-in-and-kick from
   * bench / reserves, or fill-empty) and fans out LINEUP_PLAYER_CHANGED
   * (+ BENCH_CHANGED / CAPTAIN_CHANGED when applicable). Each affected
   * UIElement updates itself off those events — this method never touches
   * local state or triggers a re-render.
   * @param {PlayerType} player - Current occupant of the clicked slot (may be a fake for empty slots).
   * @param {PlayerType} newPlayer - The picked player from the overlay.
   * @returns {Promise<void>}
   */
  async _exchangePlayer (player, newPlayer) {
    // No-op safety net: user re-picked the current occupant.
    if (!player.fake && player.id === newPlayer.id) {
      setTimeout(() => this._overlay?.remove(), 150)
      return
    }
    try {
      await server.swapLineupPlayer(player.in_game_position, newPlayer.id)
      lineUpData.squadDataChanged = false
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    }
    setTimeout(() => this._overlay?.remove(), 150)
  }
}
