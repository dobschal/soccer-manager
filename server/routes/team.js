import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { getAveragePlanPriceOfPlayer, getPlayerById } from '../helper/playerHelper.js'
import { clearCacheByPrefix, CACHE_NAMESPACES } from '../lib/cache.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getTotalRounds } from '../helper/cupHelper.js'
import { calculateStandingForTeam } from '../helper/standingHelper.js'
import { sendToUser } from '../lib/websocket.js'
import { SERVER_EVENTS } from '../../client/lib/serverEvents.js'
import { getPositionsOfFormation } from '../../client/util/formation.js'
import { getNextGameDayDate } from '../../client/util/gameDayTime.js'
import {
  activateLineup,
  createLineup,
  deleteLineup,
  ensureActiveLineup,
  getLineups,
  renameLineup,
  syncActiveLineup
} from '../helper/teamLineupHelper.js'
import { charLength } from '../lib/util.js'

const MAX_TEAM_NAME_WORD_LENGTH = 12
const MAX_TEAM_NAME_LENGTH = 32
const MAX_TEAM_SHORT_NAME_LENGTH = 12
export default {

  /**
   * @param {Request} req
   * @returns {Promise<{user: Object, team: TeamType, players: Array<PlayerType>}>}
   */
  async getMyTeam (req) {
    const team = await getTeam(req)
    const players = await query('SELECT * FROM player WHERE team_id=?', team.id)
    delete req.user.password
    delete req.user.email_verification_token
    delete req.user.email_verification_expires_at

    const { season } = await getGameDayAndSeason()
    const stats = await query(
      'SELECT player_id, SUM(goals) as goals, SUM(games_played) as games_played FROM player_season_stats WHERE season=? AND player_id IN (?) GROUP BY player_id',
      [season, players.map(p => p.id)]
    )
    const statsMap = new Map(stats.map(s => [s.player_id, s]))
    for (const player of players) {
      const s = statsMap.get(player.id)
      player.season_goals = s ? s.goals : 0
      player.season_games = s ? s.games_played : 0
    }

    return {
      user: req.user,
      team,
      players,
      isAdmin: !!req.user?.is_admin
    }
  },

  /**
   * @param {Request} req
   * @returns {Promise<{balance: number}>}
   */
  async getMyBalance (req) {
    const team = await getTeam(req)
    return { balance: team.balance }
  },

  /**
   * @param {string} color
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateColor (color, req) {
    const team = await getTeam(req)
    await query('UPDATE team SET color=? WHERE id=?', [color, team.id])
    return { success: true }
  },

  /**
   * @param {string} emblem - JSON string with emblem params (shape, pattern, color)
   * @param {string} color - Team color
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateEmblem (emblem, color, req) {
    const team = await getTeam(req)
    await query('UPDATE team SET emblem=?, color=? WHERE id=?', [emblem, color, team.id])
    return { success: true }
  },

  /**
   * @param {string} name - New team name
   * @param {string|null} [shortName] - Optional user-defined short version of the team name.
   *   Empty string or null falls back to the auto-derived short name (last word).
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateTeamName (name, shortName, req) {
    const team = await getTeam(req)
    const cleanedName = typeof name === 'string'
      ? name.replace(/\s+/g, ' ').trim()
      : ''
    if (!cleanedName) {
      throw new BadRequestError('Team name is required')
    }
    // Count code points, not UTF-16 units, so an emoji costs one character
    // here just like it does against the VARCHAR limit in MySQL.
    if (charLength(cleanedName) > MAX_TEAM_NAME_LENGTH) {
      throw new BadRequestError(`Team name can be at most ${MAX_TEAM_NAME_LENGTH} characters`)
    }
    const words = cleanedName.split(' ')
    if (words.some(w => charLength(w) > MAX_TEAM_NAME_WORD_LENGTH)) {
      throw new BadRequestError(`Each word can be at most ${MAX_TEAM_NAME_WORD_LENGTH} characters`)
    }
    const cleanedShortName = typeof shortName === 'string'
      ? shortName.replace(/\s+/g, ' ').trim()
      : ''
    if (charLength(cleanedShortName) > MAX_TEAM_SHORT_NAME_LENGTH) {
      throw new BadRequestError(`Short name can be at most ${MAX_TEAM_SHORT_NAME_LENGTH} characters`)
    }
    const [existing] = await query('SELECT id FROM team WHERE name=? AND id<>?', [cleanedName, team.id])
    if (existing) {
      throw new BadRequestError('A team with this name already exists')
    }
    await query(
      'UPDATE team SET name=?, short_name=? WHERE id=?',
      [cleanedName, cleanedShortName || null, team.id]
    )
    // Clear season results cache since team name appears in results
    clearCacheByPrefix(CACHE_NAMESPACES.SEASON_RESULTS)
    // Clear standing cache in database since it stores serialized team names
    const { season } = await getGameDayAndSeason()
    await query('DELETE FROM standing_cache WHERE season=? AND level=? AND league=?', [season, team.level, team.league])
    return { success: true }
  },

  /**
   * @param {number} teamId
   * @returns {Promise<TeamType>}
   */
  async getTeamById (teamId) {
    return await getTeamById(teamId)
  },

  /**
   * @param {number} teamId
   * @param {Request} [req]
   * @returns {Promise<{team: TeamType, players: Array<PlayerType>, user: Object|undefined, isAdmin: boolean}>}
   */
  async getTeam (teamId, req) {
    const isAdmin = Boolean(req?.user?.is_admin)
    const team = await getTeamById(teamId)
    if (!team) {
      return {
        team: null,
        players: [],
        user: undefined,
        isAdmin
      }
    }
    const players = await query('SELECT * FROM player WHERE team_id=?', [team.id])

    // Attach current-season goals/games so the player list on a foreign team's
    // page shows real stats instead of 0/0 (#430).
    const { season } = await getGameDayAndSeason()
    if (players.length > 0) {
      const stats = await query(
        'SELECT player_id, SUM(goals) as goals, SUM(games_played) as games_played FROM player_season_stats WHERE season=? AND player_id IN (?) GROUP BY player_id',
        [season, players.map(p => p.id)]
      )
      const statsMap = new Map(stats.map(s => [s.player_id, s]))
      for (const player of players) {
        const s = statsMap.get(player.id)
        player.season_goals = s ? s.goals : 0
        player.season_games = s ? s.games_played : 0
      }
    }

    let user
    if (team.user_id) {
      const users = await query('SELECT * FROM user WHERE id=? LIMIT 1', [team.user_id])
      user = users[0]
      if (user) {
        delete user.password
        delete user.email
        delete user.pending_email
        delete user.email_verification_token
        delete user.email_verification_expires_at
      }
    }
    // A foreign team's balance is admin-only information — the team page shows
    // (and lets admins edit) it, everyone else must not see it.
    if (!isAdmin) delete team.balance

    return {
      team,
      players,
      user,
      isAdmin
    }
  },

  /**
   * The most recent team the requesting user spied on with a SPY action card.
   * Powers the collapsable "last scout report" card on #my-team.
   *
   * The spy stays **active until the next game day** (the CRON boundary at
   * 00:00/12:00 UTC after the card was played). While active, the report is
   * read live, so tactic or lineup changes the opponent makes before kick-off
   * show up. Every live read also refreshes the stored snapshot, so once the
   * spy expires the report freezes at the last state the spy saw and later
   * changes no longer leak (#513).
   *
   * Returns `{ report: null }` when the user has never spied on anyone (or the
   * spied team no longer exists).
   * @param {Request} req
   * @returns {Promise<{report: {team: TeamType, players: Array<PlayerType>, spiedAt: string, expiresAt: string, active: boolean, motivatingSpeechActive: boolean}|null}>}
   */
  async getLastSpyReport (req) {
    const myTeam = await getTeam(req)
    if (!myTeam?.last_spied_team_id) return { report: null }
    const expiresAt = myTeam.last_spied_at ? getNextGameDayDate(myTeam.last_spied_at) : null
    const isActive = !!expiresAt && expiresAt.getTime() > Date.now()

    if (isActive) {
      const team = await getTeamById(myTeam.last_spied_team_id)
      if (team) {
        const players = await query('SELECT * FROM player WHERE team_id=?', [team.id])
        const snapshot = {
          team,
          players,
          motivatingSpeechActive: !!team.motivating_speech_active
        }
        // Keep the frozen copy in step with what the spy currently sees, so
        // the report stops exactly where it stood when the spy ran out.
        await query('UPDATE team SET last_spied_snapshot=? WHERE id=?', [JSON.stringify(snapshot), myTeam.id])
        return {
          report: {
            ...snapshot,
            spiedAt: myTeam.last_spied_at,
            expiresAt: expiresAt.toISOString(),
            active: true
          }
        }
      }
    }

    // Expired spy (or a team that has meanwhile vanished): the frozen snapshot
    // captured while the spy was active is authoritative.
    if (myTeam.last_spied_snapshot) {
      try {
        const snapshot = JSON.parse(myTeam.last_spied_snapshot)
        return {
          report: {
            team: snapshot.team,
            players: snapshot.players ?? [],
            spiedAt: myTeam.last_spied_at,
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
            active: false,
            motivatingSpeechActive: !!snapshot.motivatingSpeechActive
          }
        }
      } catch { /* corrupt snapshot — fall back to a live read below */ }
    }
    // Fallback for reports created before snapshots existed: live read.
    const team = await getTeamById(myTeam.last_spied_team_id)
    if (!team) return { report: null }
    const players = await query('SELECT * FROM player WHERE team_id=?', [team.id])
    return {
      report: {
        team,
        players,
        spiedAt: myTeam.last_spied_at,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        active: false,
        motivatingSpeechActive: !!team.motivating_speech_active
      }
    }
  },

  /**
   * @param {number} teamId
   * @returns {Promise<{value: number}>}
   */
  async getTeamValue (teamId) {
    const players = await query('SELECT * FROM player WHERE team_id=?', [teamId])
    const values = await Promise.all(players.map(p => getAveragePlanPriceOfPlayer(p)))
    const totalValue = values.reduce((sum, v) => sum + v, 0)
    return { value: totalValue }
  },

  /**
   * @param {Array<PlayerType>} players
   * @param {string} formation
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async saveLineup (players, formation, req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const playersFromDb = await query('SELECT * FROM player WHERE team_id=?', team.id)
    for (const playerFromRequest of players) {
      const playerFromDb = playersFromDb.find(playerFromDb => playerFromRequest.id === playerFromDb.id)
      if (!playerFromDb) throw new BadRequestError('Unknown player...')
      // The client posts the whole squad, so an unavailable player may keep the
      // slot they already hold — an injury mid-season does not wipe the lineup.
      // What is refused is *moving* them onto the pitch. Players on tour never
      // hold a slot (it is cleared when they leave), so any position for them is
      // rejected here (TA-TOUR-09).
      const nextPosition = playerFromRequest.in_game_position
      const unavailable = playerFromDb.is_suspended || playerFromDb.is_injured || playerFromDb.tour_days_left
      if (nextPosition && unavailable && nextPosition !== playerFromDb.in_game_position) {
        throw new BadRequestError('Player is unavailable')
      }
      playerFromDb.in_game_position = nextPosition
      await query('UPDATE player SET in_game_position=? WHERE id=?', [playerFromDb.in_game_position, playerFromDb.id])
    }
    await query('UPDATE team SET formation=? WHERE id=?', [formation, team.id])

    // Clear captain if the captain was removed from the lineup
    let captainCleared = false
    if (team.captain_id) {
      const captainInLineup = players.find(p => p.id === team.captain_id && p.in_game_position)
      if (!captainInLineup) {
        await query('UPDATE team SET captain_id=NULL WHERE id=?', [team.id])
        captainCleared = true
      }
    }

    await syncActiveLineup(team.id)
    return { success: true, captainCleared }
  },

  /**
   * @param {number|null} playerId - The player id to set as captain, or null to clear
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async setCaptain (playerId, req) {
    const team = await getTeam(req)
    if (playerId !== null) {
      // Verify the player belongs to this team and is in the lineup
      const [player] = await query(
        'SELECT * FROM player WHERE id=? AND team_id=? LIMIT 1',
        [playerId, team.id]
      )
      if (!player) throw new BadRequestError('Player not found in your team')
      if (!player.in_game_position) throw new BadRequestError('Captain must be in the lineup')
    }
    await query('UPDATE team SET captain_id=? WHERE id=?', [playerId, team.id])
    // Notify all this user's open tabs / devices so the (C) marker + captain
    // badge on the pitch update atomically without a full page re-render.
    if (team.user_id) {
      sendToUser(team.user_id, SERVER_EVENTS.CAPTAIN_CHANGED.name, { captainId: playerId })
    }
    await syncActiveLineup(team.id)
    return { success: true }
  },

  /**
   * @param {string} passStyle - 'short', 'mixed', or 'long'
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updatePassStyle (passStyle, req) {
    const validStyles = ['short', 'mixed', 'long']
    if (!validStyles.includes(passStyle)) {
      throw new BadRequestError('Invalid pass style')
    }
    const team = await getTeam(req)
    await query('UPDATE team SET pass_style=? WHERE id=?', [passStyle, team.id])
    await syncActiveLineup(team.id)
    return { success: true }
  },

  /**
   * @param {string} playStyle - 'aggressive', 'normal', or 'friendly'
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updatePlayStyle (playStyle, req) {
    const validStyles = ['aggressive', 'normal', 'friendly']
    if (!validStyles.includes(playStyle)) {
      throw new BadRequestError('Invalid play style')
    }
    const team = await getTeam(req)
    await query('UPDATE team SET play_style=? WHERE id=?', [playStyle, team.id])
    await syncActiveLineup(team.id)
    return { success: true }
  },

  /**
   * @param {string} attackMode - 'offensive', 'balanced', or 'defensive'
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateAttackMode (attackMode, req) {
    const validModes = ['offensive', 'balanced', 'defensive']
    if (!validModes.includes(attackMode)) {
      throw new BadRequestError('Invalid attack mode')
    }
    const team = await getTeam(req)
    await query('UPDATE team SET attack_mode=? WHERE id=?', [attackMode, team.id])
    await syncActiveLineup(team.id)
    return { success: true }
  },

  /**
   * Save bench positions (GK, DEF, MID, ATT slots)
   * @param {Array<{playerId: number, benchPosition: string, substitutionMode?: string}>} benchData
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async saveBench (benchData, req) {
    const team = await getTeam(req)
    const playersFromDb = await query('SELECT * FROM player WHERE team_id=?', [team.id])
    const validIds = new Set(playersFromDb.map(p => p.id))
    const validPositions = ['BENCH_GK', 'BENCH_DEF', 'BENCH_MID', 'BENCH_ATT']
    const validModes = ['always', 'injury_only', 'leading', 'trailing']

    // Clear all existing bench positions
    await query('UPDATE player SET bench_position=NULL WHERE team_id=?', [team.id])

    for (const { playerId, benchPosition, substitutionMode } of benchData) {
      if (!validIds.has(playerId)) throw new BadRequestError('Unknown player...')
      if (!validPositions.includes(benchPosition)) throw new BadRequestError('Invalid bench position')
      const mode = substitutionMode ?? 'injury_only'
      if (!validModes.includes(mode)) throw new BadRequestError('Invalid substitution mode')
      const player = playersFromDb.find(p => p.id === playerId)
      if (player.is_suspended || player.is_injured || player.tour_days_left) throw new BadRequestError('Player is unavailable')
      await query('UPDATE player SET bench_position=?, bench_substitution_mode=? WHERE id=?', [benchPosition, mode, playerId])
    }

    await syncActiveLineup(team.id)
    return { success: true }
  },

  /**
   * Assign a single player to a bench slot in one atomic operation:
   * clears whoever was on that slot before, removes the picked player from
   * the lineup if they were in it, and clears the captain if the removed
   * lineup player was the captain. Emits `BENCH_CHANGED` (and
   * `CAPTAIN_CHANGED` when applicable) so every open tab / device updates
   * atomically without the client stitching multiple saves together.
   * @param {number} playerId
   * @param {string} benchPosition - one of BENCH_GK / BENCH_DEF / BENCH_MID / BENCH_ATT
   * @param {Request} req
   * @returns {Promise<{success: boolean, captainCleared: boolean}>}
   */
  async assignBenchPlayer (playerId, benchPosition, req) {
    const team = await getTeam(req)
    const validPositions = ['BENCH_GK', 'BENCH_DEF', 'BENCH_MID', 'BENCH_ATT']
    if (!validPositions.includes(benchPosition)) throw new BadRequestError('Invalid bench position')
    const [player] = await query('SELECT * FROM player WHERE id=? AND team_id=? LIMIT 1', [playerId, team.id])
    if (!player) throw new BadRequestError('Player not found in your team')
    if (player.is_suspended || player.is_injured || player.tour_days_left) throw new BadRequestError('Player is unavailable')

    // Look up whoever currently occupies this bench slot — they'll be kicked
    // off (bench_position → NULL) so we can put the picked player there.
    const [displacedRow] = await query(
      'SELECT id FROM player WHERE team_id=? AND bench_position=? AND id != ? LIMIT 1',
      [team.id, benchPosition, playerId]
    )
    const displacedPlayerId = displacedRow?.id ?? null
    const vacatedLineupPosition = player.in_game_position || null

    if (displacedPlayerId) {
      await query('UPDATE player SET bench_position=NULL WHERE id=?', [displacedPlayerId])
    }
    // Setting bench_position also implies leaving the lineup — clear in_game_position.
    await query(
      'UPDATE player SET bench_position=?, in_game_position=\'\' WHERE id=?',
      [benchPosition, playerId]
    )

    // If the captain was the picked player and they were in the lineup, the
    // captain rule ("must be in lineup") is now broken — clear captain.
    let captainCleared = false
    if (vacatedLineupPosition && team.captain_id === playerId) {
      await query('UPDATE team SET captain_id=NULL WHERE id=?', [team.id])
      captainCleared = true
    }

    if (team.user_id) {
      const freshPlayer = await getPlayerById(playerId)
      sendToUser(team.user_id, SERVER_EVENTS.BENCH_CHANGED.name, {
        benchPosition,
        player: freshPlayer,
        displacedPlayerId,
        vacatedLineupPosition
      })
      if (captainCleared) {
        sendToUser(team.user_id, SERVER_EVENTS.CAPTAIN_CHANGED.name, { captainId: null })
      }
    }

    await syncActiveLineup(team.id)
    return { success: true, captainCleared }
  },

  /**
   * Put a player into a lineup slot in one atomic operation. Handles all
   * three scenarios the picker can produce:
   *
   *   1. **Swap** — the picked player was already in the lineup at another
   *      slot. Their in_game_position is swapped with the current occupant's
   *      (both stay on the pitch).
   *   2. **Move-in** — the picked player was outside the lineup (reserve or
   *      bench). They fill the slot; the old occupant (if any) is ejected
   *      from the lineup entirely.
   *   3. **Fill-empty** — the clicked slot was empty (no current occupant).
   *      The picked player just moves in.
   *
   * The route emits `LINEUP_PLAYER_CHANGED` with enough info for each
   * subscriber to update the slice of UI it owns (SquadPlayer tiles,
   * PlayerListItem rows, CaptainSelect options, …) without a page re-render.
   * When the picked player came from a bench slot, a `BENCH_CHANGED` event
   * with `player: null` follows so the affected BenchSlot clears itself.
   * When the ejected player was the team captain, `CAPTAIN_CHANGED` follows
   * with `captainId: null`.
   *
   * `currentPlayerId` / `currentFakeSlotIndex` identify which specific tile
   * the user clicked when the same lineup slot appears more than once in the
   * formation (e.g. two CDs). Without them the server would grab an
   * arbitrary player at that slot with `WHERE in_game_position=? LIMIT 1`,
   * and every same-slot SquadPlayer tile would blindly render `slots[slot]`,
   * duplicating the picked player on the pitch.
   *
   * @param {string} currentSlot - The `in_game_position` slot the user clicked.
   * @param {number} newPlayerId - The player id picked from the overlay.
   * @param {number|null} currentPlayerId - Id of the player currently on the
   *   clicked tile, or null when the tile is empty (fake).
   * @param {number|null} currentFakeSlotIndex - When the clicked tile is a
   *   fake placeholder, its ordinal (0..N-1) among same-slot tiles. Ignored
   *   when `currentPlayerId` is set.
   * @param {Request} req
   * @returns {Promise<{success: boolean, captainCleared: boolean}>}
   */
  async swapLineupPlayer (currentSlot, newPlayerId, currentPlayerId, currentFakeSlotIndex, req) {
    const team = await getTeam(req)
    const formationSlots = getPositionsOfFormation(team.formation) || []
    if (!formationSlots.includes(currentSlot)) throw new BadRequestError('Slot not in current formation')

    const [newPlayer] = await query('SELECT * FROM player WHERE id=? AND team_id=? LIMIT 1', [newPlayerId, team.id])
    if (!newPlayer) throw new BadRequestError('Player not found in your team')
    if (newPlayer.is_suspended || newPlayer.is_injured || newPlayer.tour_days_left) throw new BadRequestError('Player is unavailable')

    // Look up the current occupant by explicit id when the client sent one
    // (so we hit the exact tile the user clicked, not an arbitrary same-slot
    // player). If no id was sent, the tile is empty on the client — skip the
    // lookup entirely so a same-slot neighbor doesn't get ejected by mistake.
    let currentOccupant
    if (currentPlayerId && currentPlayerId !== newPlayerId) {
      const [occupant] = await query(
        'SELECT * FROM player WHERE id=? AND team_id=? LIMIT 1',
        [currentPlayerId, team.id]
      )
      if (!occupant) throw new BadRequestError('Current occupant not found in your team')
      if (occupant.in_game_position !== currentSlot) {
        throw new BadRequestError('Current occupant is no longer in that slot')
      }
      currentOccupant = occupant
    }

    const wasSwap = Boolean(newPlayer.in_game_position) // picked player was already in lineup
    const originalNewPlayerSlot = newPlayer.in_game_position || null
    const freedBenchPosition = newPlayer.bench_position || null

    if (wasSwap) {
      // Lineup ↔ lineup swap. Both stay on the pitch; only in_game_position
      // is exchanged. Bench_position is null on both sides already.
      await query('UPDATE player SET in_game_position=? WHERE id=?', [currentSlot, newPlayerId])
      if (currentOccupant) {
        await query('UPDATE player SET in_game_position=? WHERE id=?', [originalNewPlayerSlot, currentOccupant.id])
      }
    } else {
      // Move-in from bench / reserves. Old slot occupant (if any) is ejected.
      if (currentOccupant) {
        await query('UPDATE player SET in_game_position=\'\' WHERE id=?', [currentOccupant.id])
      }
      await query('UPDATE player SET in_game_position=?, bench_position=NULL WHERE id=?', [currentSlot, newPlayerId])
    }

    // Captain check: only relevant when the swap ejected a player from the
    // lineup entirely (rule: captain must be in the lineup).
    let captainCleared = false
    const ejectedPlayerId = (!wasSwap && currentOccupant) ? currentOccupant.id : null
    if (ejectedPlayerId && team.captain_id === ejectedPlayerId) {
      await query('UPDATE team SET captain_id=NULL WHERE id=?', [team.id])
      captainCleared = true
    }

    if (team.user_id) {
      const freshNewPlayer = await getPlayerById(newPlayerId)
      const slots = { [currentSlot]: freshNewPlayer }
      // `replacements` echoes the tile identity the client sent (real player
      // id, or fake-tile ordinal) so each SquadPlayer can decide whether IT
      // is the affected tile — the position key alone is ambiguous when the
      // formation has two or more tiles for the same slot (CD, CM, DM).
      const replacements = {
        [currentSlot]: {
          previousPlayerId: currentOccupant?.id ?? null,
          previousFakeSlotIndex: currentOccupant ? null : (currentFakeSlotIndex ?? null)
        }
      }
      // In a lineup ↔ lineup swap, the second slot also has a new occupant
      // (the ejected side of the swap). If the clicked slot was empty, the
      // picked player just moves and their old lineup slot becomes empty —
      // signalled via `emptiedSlot` + `emptiedTilePlayerId` so the specific
      // same-slot tile the picked player used to sit on turns fake.
      let emptiedSlot = null
      let emptiedTilePlayerId = null
      if (wasSwap) {
        if (currentOccupant) {
          const freshOccupant = await getPlayerById(currentOccupant.id)
          slots[originalNewPlayerSlot] = freshOccupant
          replacements[originalNewPlayerSlot] = {
            previousPlayerId: newPlayer.id,
            previousFakeSlotIndex: null
          }
        } else {
          emptiedSlot = originalNewPlayerSlot
          emptiedTilePlayerId = newPlayer.id
        }
      }
      sendToUser(team.user_id, SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name, {
        slots,
        replacements,
        ejectedPlayerId,
        emptiedSlot,
        emptiedTilePlayerId,
        freedBenchPosition
      })
      if (freedBenchPosition) {
        // The bench slot is now empty — matching BENCH_CHANGED so BenchSlot
        // clears itself and PlayerListItem drops its old bench highlight.
        sendToUser(team.user_id, SERVER_EVENTS.BENCH_CHANGED.name, {
          benchPosition: freedBenchPosition,
          player: null,
          displacedPlayerId: newPlayerId,
          vacatedLineupPosition: null
        })
      }
      if (captainCleared) {
        sendToUser(team.user_id, SERVER_EVENTS.CAPTAIN_CHANGED.name, { captainId: null })
      }
    }

    await syncActiveLineup(team.id)
    return { success: true, captainCleared }
  },

  /**
   * Update only the substitution mode for a single bench player.
   * @param {number} playerId
   * @param {string} substitutionMode
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateBenchSubstitutionMode (playerId, substitutionMode, req) {
    const team = await getTeam(req)
    const validModes = ['always', 'injury_only', 'leading', 'trailing']
    if (!validModes.includes(substitutionMode)) throw new BadRequestError('Invalid substitution mode')
    const [player] = await query('SELECT id FROM player WHERE id=? AND team_id=?', [playerId, team.id])
    if (!player) throw new BadRequestError('Unknown player...')
    await query('UPDATE player SET bench_substitution_mode=? WHERE id=?', [substitutionMode, playerId])
    await syncActiveLineup(team.id)
    return { success: true }
  },

  /**
   * @param {Array<{playerId: number, sortIndex: number}>} sortData
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async saveBenchSortOrder (sortData, req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    if (!team) throw new BadRequestError('No team found')
    const playersFromDb = await query('SELECT id FROM player WHERE team_id=?', [team.id])
    const validIds = new Set(playersFromDb.map(p => p.id))
    for (const { playerId, sortIndex } of sortData) {
      if (!validIds.has(playerId)) throw new BadRequestError('Unknown player...')
      await query('UPDATE player SET sort_index=? WHERE id=?', [sortIndex, playerId])
    }
    return { success: true }
  },

  /**
   * Every saved lineup of the requesting user's team, plus which one is
   * currently loaded (#481). A team that has none yet gets one created from
   * its current setup, so the select is never empty.
   * @param {Request} req
   * @returns {Promise<{lineups: Array<{id: number, name: string, is_active: number}>, activeId: number|null}>}
   */
  async getMyLineups (req) {
    const team = await getTeam(req)
    const active = await ensureActiveLineup(team.id)
    const lineups = await getLineups(team.id)
    return { lineups, activeId: active?.id ?? null }
  },

  /**
   * Create a new, empty lineup (random formation, nobody assigned) and make
   * it active. The outgoing lineup is snapshotted first.
   * @param {string} name
   * @param {Request} req
   * @returns {Promise<{lineups: Array, activeId: number}>}
   */
  async createMyLineup (name, req) {
    const team = await getTeam(req)
    await ensureActiveLineup(team.id)
    const { id } = await createLineup(team.id, name)
    return { lineups: await getLineups(team.id), activeId: id }
  },

  /**
   * Load a saved lineup into the team so the next match calculation uses it.
   * @param {number} lineupId
   * @param {Request} req
   * @returns {Promise<{lineups: Array, activeId: number}>}
   */
  async activateMyLineup (lineupId, req) {
    const team = await getTeam(req)
    await ensureActiveLineup(team.id)
    const { id } = await activateLineup(team.id, Number(lineupId))
    return { lineups: await getLineups(team.id), activeId: id }
  },

  /**
   * Rename one of the team's saved lineups.
   * @param {number} lineupId
   * @param {string} name
   * @param {Request} req
   * @returns {Promise<{lineups: Array, activeId: number|null}>}
   */
  async renameMyLineup (lineupId, name, req) {
    const team = await getTeam(req)
    await renameLineup(team.id, Number(lineupId), name)
    const lineups = await getLineups(team.id)
    return { lineups, activeId: lineups.find(l => l.is_active)?.id ?? null }
  },

  /**
   * Delete a saved lineup. The last remaining one cannot be deleted.
   * @param {number} lineupId
   * @param {Request} req
   * @returns {Promise<{lineups: Array, activeId: number|null}>}
   */
  async deleteMyLineup (lineupId, req) {
    const team = await getTeam(req)
    const { activeId } = await deleteLineup(team.id, Number(lineupId))
    return { lineups: await getLineups(team.id), activeId }
  },

  /**
   * Get transfer history for a specific team (trades + free agent signings)
   * @param {number} teamId
   * @returns {Promise<{transfers: Array}>}
   */
  async getTeamTransferHistory (teamId) {
    const [transfers, hiredEntries, firedEntries] = await Promise.all([
      query(`
        SELECT th.*,
               p.name as player_name, p.position as player_position,
               t1.name as from_team_name, t1.color as from_team_color, t1.emblem as from_team_emblem,
               t2.name as to_team_name, t2.color as to_team_color, t2.emblem as to_team_emblem
        FROM trade_history th
        JOIN player p ON p.id = th.player_id
        LEFT JOIN team t1 ON t1.id = th.from_team_id
        LEFT JOIN team t2 ON t2.id = th.to_team_id
        WHERE th.from_team_id = ? OR th.to_team_id = ?
        ORDER BY th.created_at DESC
      `, [teamId, teamId]),
      query(`
        SELECT ph.player_id, ph.season, ph.game_day, ph.created_at,
               p.name as player_name, p.position as player_position
        FROM player_history ph
        JOIN player p ON p.id = ph.player_id
        WHERE ph.type = 'HIRED' AND p.team_id = ?
        ORDER BY ph.created_at DESC
      `, [teamId]),
      query(`
        SELECT ph.player_id, ph.season, ph.game_day, ph.created_at,
               p.name as player_name, p.position as player_position
        FROM player_history ph
        JOIN player p ON p.id = ph.player_id
        JOIN team t ON t.name = ph.value
        WHERE ph.type = 'FIRED' AND t.id = ?
        ORDER BY ph.created_at DESC
      `, [teamId])
    ])

    const tradePlayerIds = new Set(transfers.map(tr => tr.player_id))

    const mapped = transfers.map(tr => ({
      id: tr.id,
      playerId: tr.player_id,
      playerName: tr.player_name,
      playerPosition: tr.player_position,
      fromTeamId: tr.from_team_id,
      fromTeamName: tr.from_team_name,
      fromTeam: tr.from_team_id ? { id: tr.from_team_id, name: tr.from_team_name, color: tr.from_team_color, emblem: tr.from_team_emblem } : null,
      toTeamId: tr.to_team_id,
      toTeamName: tr.to_team_name,
      toTeam: tr.to_team_id ? { id: tr.to_team_id, name: tr.to_team_name, color: tr.to_team_color, emblem: tr.to_team_emblem } : null,
      price: tr.price,
      gameDay: tr.game_day,
      season: tr.season,
      createdAt: tr.created_at,
      type: 'trade'
    }))

    for (const h of hiredEntries) {
      if (tradePlayerIds.has(h.player_id)) continue
      mapped.push({
        id: 'hired_' + h.player_id,
        playerId: h.player_id,
        playerName: h.player_name,
        playerPosition: h.player_position,
        fromTeamId: null,
        fromTeamName: null,
        fromTeam: null,
        toTeamId: teamId,
        toTeamName: null,
        toTeam: null,
        price: 0,
        gameDay: h.game_day,
        season: h.season,
        createdAt: h.created_at,
        type: 'hired'
      })
    }

    for (const f of firedEntries) {
      mapped.push({
        id: 'fired_' + f.player_id + '_' + f.created_at,
        playerId: f.player_id,
        playerName: f.player_name,
        playerPosition: f.player_position,
        fromTeamId: teamId,
        fromTeamName: null,
        fromTeam: null,
        toTeamId: null,
        toTeamName: null,
        toTeam: null,
        price: 0,
        gameDay: f.game_day,
        season: f.season,
        createdAt: f.created_at,
        type: 'fired'
      })
    }

    mapped.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    return { transfers: mapped }
  },

  /**
   * Get season history for a specific team (league positions and cup results)
   * @param {number} teamId
   * @returns {Promise<{seasons: Array}>}
   */
  async getTeamSeasonHistory (teamId) {
    const team = await getTeamById(teamId)
    if (!team) {
      return { seasons: [] }
    }

    // Get current season to exclude it (only show completed seasons)
    const { season: currentSeason } = await getGameDayAndSeason()

    // Get all completed seasons this team has played in (exclude current season)
    // Filter to league games only — cup games have level=0/league=0 which would override the real values
    const seasonData = await query(`
      SELECT DISTINCT season, level, league
      FROM game
      WHERE (team_1_id = ? OR team_2_id = ?) AND played = 1 AND season < ?
        AND (game_type = 'league' OR game_type IS NULL)
      ORDER BY season DESC
    `, [teamId, teamId, currentSeason])

    // Deduplicate seasons
    const uniqueSeasons = []
    const processedSeasons = new Set()
    for (const row of seasonData) {
      if (processedSeasons.has(row.season)) continue
      processedSeasons.add(row.season)
      uniqueSeasons.push(row)
    }

    if (uniqueSeasons.length === 0) {
      return { seasons: [] }
    }

    // Build WHERE clause for all season/level/league combos in one bulk query
    const sllConditions = uniqueSeasons.map(() => '(g.season = ? AND g.level = ? AND g.league = ?)').join(' OR ')
    const sllParams = uniqueSeasons.flatMap(r => [r.season, r.level, r.league])
    const seasonList = uniqueSeasons.map(r => r.season)
    const seasonPlaceholders = seasonList.map(() => '?').join(',')

    // Bulk-fetch all data in parallel (3 queries instead of 5*N).
    // Project only the columns we need — the `details` LONGTEXT column on `game`
    // is large and unused here, so excluding it makes the query an order of
    // magnitude faster on big tables.
    const [allLeagueGames, allCupGames, allMaxCupRounds] = await Promise.all([
      // All league games for all relevant season/level/league combos
      query(`
        SELECT g.season, g.level, g.league, g.team_1_id, g.team_2_id,
               g.goals_team_1, g.goals_team_2
        FROM game g
        WHERE (${sllConditions})
          AND g.played = 1
          AND (g.game_type = 'league' OR g.game_type IS NULL)
      `, sllParams),
      // All cup games for this team across all relevant seasons.
      // Split the OR on team_1_id / team_2_id into a UNION ALL so MySQL can
      // use the per-team indexes (idx_game_team1_played / idx_game_team2_played)
      // instead of falling back to a scan.
      query(`
        SELECT season, team_1_id, team_2_id, goals_team_1, goals_team_2, played, cup_round
        FROM game
        WHERE game_type = 'cup' AND season IN (${seasonPlaceholders}) AND team_1_id = ?
        UNION ALL
        SELECT season, team_1_id, team_2_id, goals_team_1, goals_team_2, played, cup_round
        FROM game
        WHERE game_type = 'cup' AND season IN (${seasonPlaceholders}) AND team_2_id = ?
        ORDER BY cup_round ASC
      `, [...seasonList, teamId, ...seasonList, teamId]),
      // Max cup_round per season for totalRounds calculation
      query(`
        SELECT season, MAX(cup_round) as maxRound
        FROM game
        WHERE game_type = 'cup' AND season IN (${seasonPlaceholders})
        GROUP BY season
      `, seasonList)
    ])

    // Index league games by season/level/league key
    const leagueGamesByKey = new Map()
    const teamIdsByKey = new Map()
    for (const game of allLeagueGames) {
      const key = `${game.season}/${game.level}/${game.league}`
      if (!leagueGamesByKey.has(key)) {
        leagueGamesByKey.set(key, [])
        teamIdsByKey.set(key, new Set())
      }
      leagueGamesByKey.get(key).push(game)
      teamIdsByKey.get(key).add(game.team_1_id)
      teamIdsByKey.get(key).add(game.team_2_id)
    }

    // Index cup games by season
    const cupGamesBySeason = new Map()
    for (const game of allCupGames) {
      if (!cupGamesBySeason.has(game.season)) {
        cupGamesBySeason.set(game.season, [])
      }
      cupGamesBySeason.get(game.season).push(game)
    }

    // Index max cup rounds by season
    const maxCupRoundBySeason = new Map()
    for (const row of allMaxCupRounds) {
      maxCupRoundBySeason.set(row.season, row.maxRound)
    }

    const seasons = []
    for (const row of uniqueSeasons) {
      const key = `${row.season}/${row.level}/${row.league}`
      const games = leagueGamesByKey.get(key) || []

      // Build minimal team objects from the game data (only id is needed for standing calc)
      const tIds = teamIdsByKey.get(key) || new Set()
      const teams = [...tIds].map(id => ({ id }))

      const standing = calculateStandingForTeam(games, teams, teamId)

      // Cup result
      let cupResult = null
      const cupGames = cupGamesBySeason.get(row.season) || []
      if (cupGames.length > 0) {
        const deepestCupGame = cupGames[0]
        const isWinner = deepestCupGame.played === 1 && (
          (deepestCupGame.team_1_id === teamId && deepestCupGame.goals_team_1 > deepestCupGame.goals_team_2) ||
          (deepestCupGame.team_2_id === teamId && deepestCupGame.goals_team_2 > deepestCupGame.goals_team_1)
        )
        const roundReached = deepestCupGame.cup_round
        const totalRounds = getTotalRounds(maxCupRoundBySeason.get(row.season))

        cupResult = {
          roundReached,
          totalRounds,
          isWinner: isWinner && roundReached === 1,
          gamesPlayed: cupGames.filter(g => g.played === 1).length
        }
      }

      seasons.push({
        season: row.season,
        level: row.level,
        league: row.league,
        position: standing.position,
        played: standing.played,
        won: standing.won,
        drawn: standing.drawn,
        lost: standing.lost,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        points: standing.points,
        cupResult
      })
    }

    return { seasons }
  },

  /**
   * Returns a chronological window of league + cup games for a team
   * (friendlies excluded). Supports cursor-based pagination for endless
   * scroll on the team timeline.
   *
   * @param {number} teamId
   * @param {string} mode - 'initial' | 'past' | 'future'
   * @param {number|null} cursorSeason - required for 'past'/'future'
   * @param {number|null} cursorGameDay - required for 'past'/'future'
   * @param {number} limit
   * @returns {Promise<{games: Array}>}
   */
  async getTeamTimelineGames (teamId, mode, cursorSeason, cursorGameDay, limit) {
    const numericTeamId = Number(teamId)
    if (!numericTeamId) throw new BadRequestError('Invalid teamId')
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50)
    const baseFields = `
      g.id, g.season, g.game_day, g.game_type, g.cup_round, g.played,
      g.goals_team_1, g.goals_team_2, g.team_1_id, g.team_2_id, g.level, g.league,
      t1.name AS team_1_name, t1.color AS team_1_color, t1.emblem AS team_1_emblem,
      t1.is_system_team AS team_1_is_system_team,
      t2.name AS team_2_name, t2.color AS team_2_color, t2.emblem AS team_2_emblem,
      t2.is_system_team AS team_2_is_system_team
    `

    let rows
    if (mode === 'past') {
      if (cursorSeason == null || cursorGameDay == null) throw new BadRequestError('Cursor required')
      rows = await query(`
        SELECT ${baseFields}
        FROM game g
        JOIN team t1 ON t1.id = g.team_1_id
        JOIN team t2 ON t2.id = g.team_2_id
        WHERE (g.team_1_id = ? OR g.team_2_id = ?)
          AND (g.game_type IN ('league', 'cup') OR g.game_type IS NULL)
          AND (g.season < ? OR (g.season = ? AND g.game_day < ?))
        ORDER BY g.season DESC, g.game_day DESC
        LIMIT ?
      `, [numericTeamId, numericTeamId, cursorSeason, cursorSeason, cursorGameDay, safeLimit])
      rows.reverse()
    } else if (mode === 'future') {
      if (cursorSeason == null || cursorGameDay == null) throw new BadRequestError('Cursor required')
      rows = await query(`
        SELECT ${baseFields}
        FROM game g
        JOIN team t1 ON t1.id = g.team_1_id
        JOIN team t2 ON t2.id = g.team_2_id
        WHERE (g.team_1_id = ? OR g.team_2_id = ?)
          AND (g.game_type IN ('league', 'cup') OR g.game_type IS NULL)
          AND (g.season > ? OR (g.season = ? AND g.game_day > ?))
        ORDER BY g.season ASC, g.game_day ASC
        LIMIT ?
      `, [numericTeamId, numericTeamId, cursorSeason, cursorSeason, cursorGameDay, safeLimit])
    } else {
      const halfLimit = Math.max(Math.floor(safeLimit / 2), 1)
      const [pastRows, futureRows] = await Promise.all([
        query(`
          SELECT ${baseFields}
          FROM game g
          JOIN team t1 ON t1.id = g.team_1_id
          JOIN team t2 ON t2.id = g.team_2_id
          WHERE (g.team_1_id = ? OR g.team_2_id = ?)
            AND g.played = 1
            AND (g.game_type IN ('league', 'cup') OR g.game_type IS NULL)
          ORDER BY g.season DESC, g.game_day DESC
          LIMIT ?
        `, [numericTeamId, numericTeamId, halfLimit]),
        query(`
          SELECT ${baseFields}
          FROM game g
          JOIN team t1 ON t1.id = g.team_1_id
          JOIN team t2 ON t2.id = g.team_2_id
          WHERE (g.team_1_id = ? OR g.team_2_id = ?)
            AND g.played = 0
            AND (g.game_type IN ('league', 'cup') OR g.game_type IS NULL)
          ORDER BY g.season ASC, g.game_day ASC
          LIMIT ?
        `, [numericTeamId, numericTeamId, halfLimit])
      ])
      pastRows.reverse()
      rows = [...pastRows, ...futureRows]
    }

    const cupSeasons = [...new Set(rows.filter(r => r.game_type === 'cup').map(r => r.season))]
    const totalRoundsBySeason = new Map()
    if (cupSeasons.length > 0) {
      const placeholders = cupSeasons.map(() => '?').join(',')
      const maxRows = await query(
        `SELECT season, MAX(cup_round) AS maxRound FROM game WHERE game_type='cup' AND season IN (${placeholders}) GROUP BY season`,
        cupSeasons
      )
      for (const r of maxRows) totalRoundsBySeason.set(r.season, getTotalRounds(r.maxRound))
    }

    const games = rows.map(r => {
      const isHome = r.team_1_id === numericTeamId
      const opponentRaw = isHome
        ? { id: r.team_2_id, name: r.team_2_name, color: r.team_2_color, emblem: r.team_2_emblem, isSystemTeam: !!r.team_2_is_system_team }
        : { id: r.team_1_id, name: r.team_1_name, color: r.team_1_color, emblem: r.team_1_emblem, isSystemTeam: !!r.team_1_is_system_team }
      let result = null
      if (r.played === 1) {
        const own = isHome ? r.goals_team_1 : r.goals_team_2
        const opp = isHome ? r.goals_team_2 : r.goals_team_1
        result = own > opp ? 'win' : own < opp ? 'loss' : 'draw'
      }
      return {
        id: r.id,
        season: r.season,
        gameDay: r.game_day,
        gameType: r.game_type || 'league',
        cupRound: r.cup_round,
        totalRounds: r.game_type === 'cup' ? (totalRoundsBySeason.get(r.season) || 0) : null,
        played: r.played === 1,
        isHome,
        goalsTeam1: r.goals_team_1,
        goalsTeam2: r.goals_team_2,
        level: r.level,
        league: r.league,
        opponent: opponentRaw,
        result
      }
    })

    return { games }
  },

  /**
   * Head-to-head record between two teams: every played game between them
   * plus aggregated win/draw/loss counts and goals. Used by the team-page
   * "Direktvergleich" overlay.
   * @param {number} teamAId
   * @param {number} teamBId
   * @returns {Promise<{teamA: object, teamB: object, games: Array, stats: object}>}
   */
  async getHeadToHead (teamAId, teamBId) {
    const aId = Number(teamAId)
    const bId = Number(teamBId)
    if (!aId || !bId || aId === bId) throw new BadRequestError('Invalid team ids')

    const [teamA, teamB] = await Promise.all([
      getTeamById(aId),
      getTeamById(bId)
    ])
    if (!teamA || !teamB) throw new BadRequestError('Team not found')

    const rows = await query(
      `SELECT g.id, g.season, g.game_day, g.game_type, g.cup_round, g.played,
              g.goals_team_1, g.goals_team_2, g.team_1_id, g.team_2_id, g.created_at,
              t1.name AS team_1_name, t1.color AS team_1_color, t1.emblem AS team_1_emblem,
              t2.name AS team_2_name, t2.color AS team_2_color, t2.emblem AS team_2_emblem
       FROM game g
       JOIN team t1 ON t1.id = g.team_1_id
       JOIN team t2 ON t2.id = g.team_2_id
       WHERE g.played = 1
         AND ((g.team_1_id = ? AND g.team_2_id = ?) OR (g.team_1_id = ? AND g.team_2_id = ?))
         AND (g.game_type IN ('league', 'cup', 'friendly') OR g.game_type IS NULL)
       ORDER BY g.season DESC, g.game_day DESC, g.id DESC`,
      [aId, bId, bId, aId]
    )

    let winsA = 0
    let winsB = 0
    let draws = 0
    let goalsA = 0
    let goalsB = 0
    const games = rows.map(r => {
      const aIsTeam1 = r.team_1_id === aId
      const ownGoals = aIsTeam1 ? r.goals_team_1 : r.goals_team_2
      const oppGoals = aIsTeam1 ? r.goals_team_2 : r.goals_team_1
      goalsA += ownGoals || 0
      goalsB += oppGoals || 0
      if (ownGoals > oppGoals) winsA++
      else if (ownGoals < oppGoals) winsB++
      else draws++
      return {
        id: r.id,
        season: r.season,
        gameDay: r.game_day,
        gameType: r.game_type || 'league',
        cupRound: r.cup_round,
        team1Id: r.team_1_id,
        team2Id: r.team_2_id,
        team1Name: r.team_1_name,
        team1Color: r.team_1_color,
        team1Emblem: r.team_1_emblem,
        team2Name: r.team_2_name,
        team2Color: r.team_2_color,
        team2Emblem: r.team_2_emblem,
        goalsTeam1: r.goals_team_1,
        goalsTeam2: r.goals_team_2,
        playedAt: r.created_at
      }
    })

    return {
      teamA: { id: teamA.id, name: teamA.name, color: teamA.color, emblem: teamA.emblem },
      teamB: { id: teamB.id, name: teamB.name, color: teamB.color, emblem: teamB.emblem },
      games,
      stats: { winsA, winsB, draws, goalsA, goalsB, totalGames: games.length }
    }
  }
}

