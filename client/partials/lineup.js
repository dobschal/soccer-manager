import {UIElement} from '../lib/UIElement.js'
import {toast} from './toast.js'
import {server} from '../lib/gateway.js'
import {showOverlay} from './overlay.js'
import {SelectPlayerOverlay} from './selectPlayerOverlay.js'
import {renderPlayerImage} from './playerImage.js'
import {getPositionsOfFormation} from '../util/formation.js'
import {deepCopy} from '../lib/deepCopy.js'
import {renderLevelBadge} from './levelBadge.js'
import {fire} from '../lib/event.js'
import {t, getLocale} from '../i18n/index.js'
import {SERVER_EVENTS} from '../lib/serverEvents.js'
import {el} from '../lib/html.js'
import {calculatePlayerAge} from '../util/player.js'

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
   * @param {number} slotOrdinal - Ordinal (0..N-1) among same-slot tiles.
   *   Used to disambiguate multi-tile slots (CD/CM/DM) so the click handler
   *   and LINEUP_PLAYER_CHANGED filter can address a specific tile even when
   *   the slot name is shared.
   */
  constructor (player, team, lineupOffset = '', slotOrdinal = 0) {
    super()
    this.player = player
    this.team = team
    this.lineupOffset = lineupOffset
    this.slotOrdinal = slotOrdinal
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
    // Use player ID for real players, or 'fake-{slot}-{ordinal}' for empty
    // slots. Including the ordinal keeps each fake tile distinguishable when
    // the formation has more than one slot at the same position (e.g. 2 CDs).
    const playerId = player.fake ? `fake-${this.slot}-${this.slotOrdinal}` : player.id
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
        ${renderLevelBadge(player.level, {size: 'lg'})}
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
        // Which tile at MY slot got replaced? The position key alone is
        // ambiguous when the formation has more than one tile at the same
        // slot (2 CDs / 3 CMs), so we filter on the outgoing tile identity
        // the server echoed in `replacements[this.slot]`. `this.slot` is
        // frozen in the constructor and can't drift even if Lineup's handler
        // (which fires first) already mutated the shared player object's
        // in_game_position.
        const replacement = data.replacements?.[this.slot]
        const newOccupant = data.slots?.[this.slot] ?? null
        if (replacement && newOccupant) {
          const isMe = this.player.fake
            ? replacement.previousFakeSlotIndex === this.slotOrdinal
            : replacement.previousPlayerId === this.player.id
          if (isMe) {
            if (!this.player.fake && this.player.id === newOccupant.id) return
            this.player = newOccupant
            this._isCaptain = !newOccupant.fake && newOccupant.id === this.team.captain_id
            this.update()
            return
          }
          // Not the tile that received the picked player — but I might be the
          // source tile they vacated. When both source and destination share
          // the same slot (e.g. moving a player between two CM tiles), the
          // event carries `replacements[slot]` AND `emptiedSlot === slot`, so
          // we must NOT bail here: fall through to the emptied/ejected check
          // below, otherwise the moved player stays painted on my tile too
          // (duplicate on the pitch).
        }
        // No new occupant for me. Two remaining reasons to turn into a fake:
        // my player was ejected from the lineup, or the swap emptied my slot
        // (the picked player used to sit on THIS specific tile and no one
        // replaced them — matched by `emptiedTilePlayerId`, not just slot).
        if (this.player.fake) return
        const wasEjected = data.ejectedPlayerId === this.player.id
        const wasEmptied = data.emptiedSlot === this.slot &&
          data.emptiedTilePlayerId === this.player.id
        if (!wasEjected && !wasEmptied) return
        this.player = this._buildFakePlayer()
        this._isCaptain = false
        this.update()
      },
      // Action-card driven stat changes (freshness/level/star). Freshness
      // colours the freshness badge, level drives the level badge — a plain
      // update() picks it all up. Fakes have no id to match, so they skip.
      [SERVER_EVENTS.PLAYER_UPDATED.name]: (data) => {
        if (this.player.fake) return
        if (data?.player?.id !== this.player.id) return
        Object.assign(this.player, data.player)
        this.update()
      }
    }
  }

  onMounted () {
    // Stagger the first reveal so the eleven tiles pop in at slightly
    // different times instead of all landing on the same frame.
    this._loadImage(true)
  }

  onUpdate () {
    this._loadImage(false)
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

  // Tracks which real player id was last painted on this tile, so we only fire
  // the appearance "boom" when the occupant actually changes — not on in-place
  // stat refreshes (captain/freshness/level) that re-render the same player.
  _lastRenderedPlayerId = null

  /**
   * @param {boolean} [stagger] - When true, delay the reveal by a random
   *   0 / 200 / 400ms so a full lineup doesn't pop in all at once.
   * @private
   */
  _loadImage (stagger = false) {
    if (this.player.fake) return
    const appearingPlayerId = this.player.id
    const isNewAppearance = this._lastRenderedPlayerId !== appearingPlayerId
    this._lastRenderedPlayerId = appearingPlayerId
    const delay = stagger ? [0, 200, 400][Math.floor(Math.random() * 3)] : 0
    renderPlayerImage(this.player, this.team, 100, {isCaptain: this._isCaptain}).then(image => {
      const reveal = () => {
        const el = document.querySelector(this._elementQuery)
        if (!el) return
        // The image is prepended to the tile div; onUpdate() replaces the div
        // wholesale, so we don't have to strip a stale image first.
        el.insertAdjacentHTML('afterbegin', image)
        if (isNewAppearance) this._playAppearanceBurst(el)
      }
      if (delay) {
        setTimeout(reveal, delay)
      } else {
        reveal()
      }
    })
  }

  /**
   * "Boom" — a flash of light plus rays shooting out in all directions behind
   * a player the first time they land on this tile. The burst is inserted as
   * the tile's first child so it paints behind the player image and badges,
   * and removed once the CSS animation has finished to keep the DOM clean.
   * @param {HTMLElement} el - The tile's `.player` element.
   * @private
   */
  _playAppearanceBurst (el) {
    const burst = document.createElement('div')
    burst.className = 'player-burst'
    // Build the rays individually so each one can get a random length — the
    // per-ray `--len` is a genuinely dynamic value, the only case where an
    // inline style is allowed (everything static lives in squad.css).
    const rayCount = 12
    const step = 360 / rayCount
    let rays = ''
    for (let i = 0; i < rayCount; i++) {
      // Even spacing with a little jitter, and a random length per ray.
      const angle = (i * step + (Math.random() * step * 0.5 - step * 0.25)).toFixed(1)
      const len = (5 + Math.random() * 6).toFixed(1)
      rays += `<i class="player-burst__ray" style="--angle: ${angle}deg; --len: ${len}cqi;"></i>`
    }
    burst.innerHTML = `<span class="player-burst__rays">${rays}</span><span class="player-burst__core"></span>`
    el.insertBefore(burst, el.firstChild)
    setTimeout(() => burst.remove(), 700)
  }
}

export class Lineup extends UIElement {
  /**
   * @param {PlayerType[]} players
   * @param {TeamType} team
   * @param {number} [season] current season, used to compute the average age
   */
  constructor (players, team, season) {
    super()
    // Drop any fake placeholders that came in with the input. Lineup is often
    // re-rendered after firing 'lineup-exchange' with `this.players`, which
    // includes the fakes added by the previous _fillEmptyPositions run. If we
    // kept them, the new _fillEmptyPositions would race them against the real
    // players for slots — and depending on array order, a leftover fake could
    // claim a slot first and silently kick the real player into the reserves.
    this.players = deepCopy(players).filter(p => !p.fake)
    this.team = team
    this.season = season
    this._fillEmptyPositions()
  }

  /**
   * The season is needed to compute the average-age overlay. A parent may hand
   * it to the constructor, but that value isn't always ready when the Lineup is
   * built (the parent's own load() may not have populated it yet). Fetch it here
   * as a fallback — `getCurrentGameday` is cached by the gateway, so this is
   * effectively free when the parent already fetched it.
   * @returns {Promise<void>}
   */
  async load () {
    // `!= null`, not a truthiness check: season 0 is a valid season (a freshly
    // prepared database starts at season 0), so `if (this.season)` would wrongly
    // treat it as "not provided" and refetch.
    if (this.season != null) return
    const {season} = await server.getCurrentGameday()
    this.season = season
  }

  /**
   * @returns {string}
   */
  get template () {
    const offsets = this._computeLineupOffsets()
    const ordinals = this._computeSlotOrdinals()
    return `
      <div class="lineup-container">
        <div class="card bg-dark lineup-pitch">
          <div class="squad card-body">
            <div class="lineup-stats-overlay">${this._statsOverlayInner()}</div>
            ${this.players.filter(p => p.in_game_position).map(p =>
    `${new SquadPlayer(p, this.team, offsets.get(p) ?? '', ordinals.get(p) ?? 0)}`
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
          // Fake tiles carry `fake-{slot}-{ordinal}` so we can tell same-slot
          // fakes apart. Real players carry a numeric id.
          let player
          let fakeSlotIndex = null
          if (playerId.startsWith('fake-')) {
            const match = playerId.match(/^fake-(.+)-(\d+)$/)
            if (!match) return
            const slot = match[1]
            fakeSlotIndex = Number(match[2])
            // Any fake at that slot works for the overlay filter — they're
            // placeholders. The specific tile identity is carried by
            // fakeSlotIndex, which we send to the server.
            player = this.players.find(p => p.fake && p.in_game_position === slot)
          } else {
            player = this.players.find(p => p.id === Number(playerId))
          }

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
                newPlayer => this._exchangePlayer(player, newPlayer, fakeSlotIndex),
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
        // A player left the lineup — recompute the strength / average-age overlay.
        this._refreshStatsOverlay()
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
        // A swap can bring in a player of a different level/age, so the
        // strength and average-age overlay must be recomputed.
        this._refreshStatsOverlay()
      },
      // Action-card driven stat change. Each SquadPlayer refreshes its own
      // freshness/level badges off the same event; Lineup only owns the
      // strength-overlay, so it patches that in place. Doing this here
      // (instead of a full update()) avoids re-creating every tile.
      [SERVER_EVENTS.PLAYER_UPDATED.name]: (data) => {
        if (!data?.player) return
        const p = this.players.find(x => !x.fake && x.id === data.player.id)
        if (!p) return
        Object.assign(p, data.player)
        this._refreshStatsOverlay()
      }
    }
  }

  onMounted () {
    void this._autoCleanupIfNeeded()
  }

  /**
   * Average age of the given starting players (unrounded — the caller formats
   * it to one decimal place). Returns null when the age can't be computed (no
   * starters or no season), so the caller can skip the age overlay entirely.
   * @param {PlayerType[]} starters
   * @returns {number|null}
   */
  _averageAge (starters) {
    // `this.season == null`, not `!this.season`: season 0 is valid (a freshly
    // prepared database starts at season 0). A truthiness check would suppress
    // the age overlay for the whole first season.
    if (this.season == null || starters.length === 0) return null
    const total = starters.reduce((sum, p) => sum + calculatePlayerAge(p, this.season), 0)
    return total / starters.length
  }

  /**
   * Inner markup of the stats overlay (lineup strength + average age). Shared
   * by `template` and `_refreshStatsOverlay` so a swap/bench move can patch the
   * overlay in place with exactly the same markup the full render produces.
   * @returns {string}
   */
  _statsOverlayInner () {
    const starters = this.players.filter(p => p.in_game_position && !p.fake)
    const lineupStrength = starters.reduce((sum, p) => sum + p.level, 0)
    const avgAge = this._averageAge(starters)
    // One decimal place, localised separator: "20.0" (en) vs "20,0" (de).
    const avgAgeLabel = avgAge === null
      ? null
      : avgAge.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    return `
      <span class="lineup-strength-overlay">💪${lineupStrength}</span>
      ${avgAgeLabel === null ? '' : `<span class="lineup-age-overlay">⏳${avgAgeLabel}</span>`}
    `
  }

  /**
   * Recompute strength + average age and patch the stats overlay in place.
   * Called by the swap / bench / stat-change handlers which reshape the lineup
   * without a full re-render — otherwise the overlay would keep showing stale
   * numbers. Bails quietly when the element isn't mounted (event fired while
   * detached). Rewriting the whole container (rather than each span) also
   * handles the age overlay appearing/disappearing as starters cross zero.
   * @returns {void}
   */
  _refreshStatsOverlay () {
    const overlayEl = el(`${this._elementQuery} .lineup-stats-overlay`)
    if (!overlayEl) return
    overlayEl.innerHTML = this._statsOverlayInner()
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
   * Assign each rendered tile an ordinal within its position (0..N-1). Used
   * to give same-slot SquadPlayer instances a stable identity so click
   * routing and LINEUP_PLAYER_CHANGED can address a specific tile even when
   * the slot name (e.g. 'CD') is shared by multiple tiles.
   * @returns {Map<PlayerType, number>}
   */
  _computeSlotOrdinals () {
    const ordinals = new Map()
    const counters = new Map()
    for (const player of this.players.filter(p => p.in_game_position)) {
      const idx = counters.get(player.in_game_position) ?? 0
      counters.set(player.in_game_position, idx + 1)
      ordinals.set(player, idx)
    }
    return ordinals
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
   * @param {number|null} fakeSlotIndex - When the clicked tile was a fake,
   *   its ordinal (0..N-1) among same-slot tiles. Ignored for real players.
   * @returns {Promise<void>}
   */
  async _exchangePlayer (player, newPlayer, fakeSlotIndex = null) {
    this._overlay?.remove()
    // No-op safety net: user re-picked the current occupant.
    if (!player.fake && player.id === newPlayer.id) {
      return
    }
    try {
      // Tell the server exactly which tile the user clicked. Without this
      // the server would grab an arbitrary same-slot player with
      // `WHERE in_game_position=? LIMIT 1` and the tile filter downstream
      // would render the picked player on every same-slot tile.
      const currentPlayerId = player.fake ? null : player.id
      await server.swapLineupPlayer(
        player.in_game_position,
        newPlayer.id,
        currentPlayerId,
        player.fake ? fakeSlotIndex : null
      )
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    }
  }
}
