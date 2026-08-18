import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { canReceiveActionCard } from './actionCardHelper.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { addLogMessage } from './logMessageHelper.js'
import { getUserLocale, t } from '../i18n/index.js'

/**
 * The three tours a club can send players on, and what a full progress bar
 * pays out (#535). Each entry's `reward` is handed over as pending action
 * cards, so it surfaces through the usual claim overlay.
 * @type {Array<{key: string, reward: Array<{action: string, amount: number}>}>}
 */
export const TOURS = [
  // South America pays a single youth star: two of them made youth cards far
  // too common once the other sources were counted in.
  { key: 'south_america', reward: [{ action: 'NEW_YOUTH_PLAYER_3', amount: 1 }] },
  { key: 'asia', reward: [{ action: 'MILLION_BONUS', amount: 1 }] },
  { key: 'europe', reward: [{ action: 'LEVEL_UP_PLAYER_100', amount: 4 }] }
]

/** Valid tour keys, for validating what the client sends. */
export const TOUR_KEYS = TOURS.map(tour => tour.key)

/**
 * Progress needed to fill the bar. One average player away for one game day
 * scores 1 point, so this is roughly "three regulars for two full trips".
 */
export const TOUR_PROGRESS_TARGET = 30

/** A trip lasts at least this many game days… */
export const TOUR_MIN_DAYS = 3

/** …and at most this many. */
export const TOUR_MAX_DAYS = 7

/**
 * How many players may be away at the same time. Deliberately tight: the whole
 * cost of a tour is that these players cannot be fielded.
 */
export const MAX_PLAYERS_ON_TOUR = 3

/**
 * A player's contribution per game day, measured against their own squad so a
 * fourth-division club can fill the bar as fast as a first-division one. An
 * average player scores 1.0, the squad's best around 1.2.
 * @param {number} playerLevel
 * @param {number} squadAverageLevel
 * @returns {number}
 */
export function tourProgressPerGameDay (playerLevel, squadAverageLevel) {
  if (!squadAverageLevel || squadAverageLevel <= 0) return 0
  return Math.max(0, Number(playerLevel) || 0) / squadAverageLevel
}

/**
 * The team's tour row, creating a default one on first access so the page
 * always has something to render.
 * @param {number} teamId
 * @returns {Promise<{team_id: number, mode: string, progress: number}>}
 */
export async function getTour (teamId) {
  const [row] = await query('SELECT * FROM team_tour WHERE team_id=? LIMIT 1', [teamId])
  if (row) return { ...row, progress: Number(row.progress) }
  await query('INSERT INTO team_tour SET ?', { team_id: teamId, mode: TOURS[0].key, progress: 0 })
  return { team_id: teamId, mode: TOURS[0].key, progress: 0 }
}

/**
 * Switch the destination. Progress is deliberately dropped — the players were
 * training for something else, and the UI warns before calling this (#535).
 * @param {number} teamId
 * @param {string} mode
 * @returns {Promise<{mode: string, progress: number}>}
 */
export async function setTourMode (teamId, mode) {
  if (!TOUR_KEYS.includes(mode)) throw new BadRequestError('Unknown tour')
  await getTour(teamId)
  await query('UPDATE team_tour SET mode=?, progress=0 WHERE team_id=?', [mode, teamId])
  return { mode, progress: 0 }
}

/**
 * Send players away for a number of game days.
 *
 * Replaces nothing: players already travelling keep their remaining days and
 * count against {@link MAX_PLAYERS_ON_TOUR}. Injured or suspended players are
 * refused — they are already unavailable and would otherwise dodge their
 * suspension by leaving the country.
 *
 * @param {number} teamId
 * @param {number[]} playerIds
 * @param {number} days
 * @returns {Promise<{sent: number}>}
 */
export async function sendPlayersOnTour (teamId, playerIds, days) {
  const safeDays = Math.floor(Number(days) || 0)
  if (safeDays < TOUR_MIN_DAYS || safeDays > TOUR_MAX_DAYS) {
    throw new BadRequestError(`A tour lasts between ${TOUR_MIN_DAYS} and ${TOUR_MAX_DAYS} game days`)
  }
  const ids = [...new Set((Array.isArray(playerIds) ? playerIds : []).map(Number).filter(Boolean))]
  if (ids.length === 0) throw new BadRequestError('No players selected')

  const [{ away }] = await query(
    'SELECT COUNT(*) AS away FROM player WHERE team_id=? AND tour_days_left > 0',
    [teamId]
  )
  if (away + ids.length > MAX_PLAYERS_ON_TOUR) {
    throw new BadRequestError(`At most ${MAX_PLAYERS_ON_TOUR} players can be on tour at once`)
  }

  const players = await query(
    'SELECT id, is_injured, is_suspended, tour_days_left FROM player WHERE team_id=? AND id IN (?)',
    [teamId, ids]
  )
  if (players.length !== ids.length) throw new BadRequestError('Player not found in your team')
  for (const player of players) {
    if (player.is_injured || player.is_suspended) throw new BadRequestError('Player is unavailable')
    if (player.tour_days_left > 0) throw new BadRequestError('Player is already on tour')
  }

  // Leaving the squad also means leaving the pitch and the bench, otherwise the
  // lineup would silently field a player who is not there.
  await query(
    "UPDATE player SET tour_days_left=?, tour_days_total=?, in_game_position='', bench_position=NULL WHERE team_id=? AND id IN (?)",
    [safeDays, safeDays, teamId, ids]
  )
  await getTour(teamId)
  return { sent: ids.length }
}

/**
 * Cancel a trip that has not started yet.
 *
 * A player may be called back only while `tour_days_left` is still the full
 * duration they were sent for — no match day has passed, so they earned nothing
 * and give nothing back. Once the first match day is played the trip is binding,
 * otherwise a manager could bank the progress and still field the player.
 *
 * @param {number} teamId
 * @param {number[]} playerIds
 * @returns {Promise<{recalled: number}>}
 */
export async function recallPlayersFromTour (teamId, playerIds) {
  const ids = [...new Set((Array.isArray(playerIds) ? playerIds : []).map(Number).filter(Boolean))]
  if (ids.length === 0) throw new BadRequestError('No players selected')

  const players = await query(
    'SELECT id, tour_days_left, tour_days_total FROM player WHERE team_id=? AND id IN (?)',
    [teamId, ids]
  )
  if (players.length !== ids.length) throw new BadRequestError('Player not found in your team')
  for (const player of players) {
    if (player.tour_days_left <= 0) throw new BadRequestError('Player is not on tour')
    if (!canRecallFromTour(player)) throw new BadRequestError('The tour has already started')
  }

  // The lineup slots were cleared when they left; the manager has to set them
  // up again, same as after any other absence.
  await query(
    'UPDATE player SET tour_days_left=0, tour_days_total=0 WHERE team_id=? AND id IN (?)',
    [teamId, ids]
  )
  return { recalled: ids.length }
}

/**
 * Whether a travelling player can still be pulled out of their trip.
 * @param {{tour_days_left: number, tour_days_total: number}} player
 * @returns {boolean}
 */
export function canRecallFromTour (player) {
  return Number(player.tour_days_left) > 0 &&
    Number(player.tour_days_left) === Number(player.tour_days_total)
}

/**
 * Advance every club's tour by one game day: score the travelling players,
 * count their trip down, and pay out whenever the bar fills.
 *
 * Called once per game day after the matches (see play-game-day.js). Runs for
 * every team that has someone away, so a club keeps earning while it plays.
 *
 * @returns {Promise<{teams: number, rewarded: number}>}
 */
export async function advanceTours () {
  const teams = await query(
    `SELECT t.id, t.user_id, tt.mode, tt.progress
     FROM team t
     JOIN team_tour tt ON tt.team_id = t.id
     WHERE EXISTS (SELECT 1 FROM player p WHERE p.team_id = t.id AND p.tour_days_left > 0)`
  )
  let rewarded = 0
  for (const team of teams) {
    try {
      if (await _advanceTeamTour(team)) rewarded++
    } catch (e) {
      console.error(`[Tour] Failed to advance tour for team ${team.id}:`, e?.message ?? e)
    }
  }
  // Everyone who was away is one day closer to home, including teams whose
  // tour row somehow went missing.
  await query('UPDATE player SET tour_days_left = tour_days_left - 1 WHERE tour_days_left > 0')
  // Home again — drop the booked duration so the column never lingers and make
  // a fresh trip comparable against a clean slate.
  await query('UPDATE player SET tour_days_total = 0 WHERE tour_days_left <= 0 AND tour_days_total > 0')
  if (teams.length > 0) {
    console.log(`✈️ Advanced ${teams.length} tour(s), ${rewarded} completed.`)
  }
  return { teams: teams.length, rewarded }
}

/**
 * @param {{id: number, user_id: number|null, mode: string, progress: number}} team
 * @returns {Promise<boolean>} whether the bar filled and a reward was paid
 */
async function _advanceTeamTour (team) {
  const players = await query('SELECT level, tour_days_left FROM player WHERE team_id=?', [team.id])
  if (players.length === 0) return false
  const squadAverage = players.reduce((sum, p) => sum + Number(p.level), 0) / players.length
  const gained = players
    .filter(p => p.tour_days_left > 0)
    .reduce((sum, p) => sum + tourProgressPerGameDay(p.level, squadAverage), 0)
  if (gained <= 0) return false

  const progress = Number(team.progress) + gained
  if (progress < TOUR_PROGRESS_TARGET) {
    await query('UPDATE team_tour SET progress=? WHERE team_id=?', [progress, team.id])
    return false
  }

  // Carry the surplus over rather than dropping it, so a big final day is not
  // wasted.
  await query('UPDATE team_tour SET progress=? WHERE team_id=?', [progress - TOUR_PROGRESS_TARGET, team.id])
  await _grantTourReward(team)
  return true
}

/**
 * Hand over the finished tour's cards and tell the manager about it.
 * @param {{id: number, user_id: number|null, mode: string}} team
 * @returns {Promise<void>}
 */
async function _grantTourReward (team) {
  const tour = TOURS.find(entry => entry.key === team.mode) ?? TOURS[0]
  const { season } = await getGameDayAndSeason()
  let granted = 0
  for (const { action, amount } of tour.reward) {
    for (let i = 0; i < amount; i++) {
      // A capped stack would leave the card stuck on `pending` forever.
      if (!(await canReceiveActionCard(team.id, action))) continue
      await query('INSERT INTO action_card SET ?', {
        team_id: team.id, action, played: 0, state: 'pending', season
      })
      granted++
    }
  }
  if (!team.user_id) return
  const locale = await getUserLocale(team.user_id)
  await addLogMessage(
    t('log.tourCompleted', { tour: t(`tour.${tour.key}`, {}, locale), count: granted }, locale),
    { id: team.id, user_id: team.user_id },
    'OPEN_TOUR', null, 'plane', undefined, 'success'
  )
}
