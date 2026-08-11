import { query } from '../lib/database.js'
import { getTeam } from '../helper/teamHelper.js'
import {
  canRecallFromTour,
  getTour,
  MAX_PLAYERS_ON_TOUR,
  recallPlayersFromTour,
  sendPlayersOnTour,
  setTourMode,
  TOUR_MAX_DAYS,
  TOUR_MIN_DAYS,
  TOUR_PROGRESS_TARGET,
  TOURS,
  tourProgressPerGameDay
} from '../helper/tourHelper.js'

export default {

  /**
   * Everything the "On Tour" page needs: the chosen destination, how full the
   * bar is, who is currently away, and what each destination pays out (#535).
   * @param {Request} req
   * @returns {Promise<object>}
   */
  async getMyTour (req) {
    const team = await getTeam(req)
    const tour = await getTour(team.id)
    const players = await query(
      'SELECT id, name, position, level, is_injured, is_suspended, tour_days_left, tour_days_total FROM player WHERE team_id=?',
      [team.id]
    )
    const squadAverage = players.length > 0
      ? players.reduce((sum, p) => sum + Number(p.level), 0) / players.length
      : 0
    const away = players.filter(p => p.tour_days_left > 0)

    return {
      mode: tour.mode,
      progress: tour.progress,
      target: TOUR_PROGRESS_TARGET,
      minDays: TOUR_MIN_DAYS,
      maxDays: TOUR_MAX_DAYS,
      maxPlayers: MAX_PLAYERS_ON_TOUR,
      freeSlots: Math.max(0, MAX_PLAYERS_ON_TOUR - away.length),
      squadAverage,
      tours: TOURS.map(t => ({ key: t.key, reward: t.reward })),
      // Every player with the per-game-day yield they would add, so the page can
      // show what picking them is worth before the user commits.
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        level: p.level,
        isInjured: Boolean(p.is_injured),
        isSuspended: Boolean(p.is_suspended),
        tourDaysLeft: p.tour_days_left,
        // Still callable back: the trip was booked but no match day has passed.
        canRecall: canRecallFromTour(p),
        progressPerGameDay: tourProgressPerGameDay(p.level, squadAverage)
      }))
    }
  },

  /**
   * Pick a destination. Switching wipes the progress — the client warns first.
   * @param {string} mode
   * @param {Request} req
   * @returns {Promise<{mode: string, progress: number}>}
   */
  async setMyTourMode (mode, req) {
    const team = await getTeam(req)
    return await setTourMode(team.id, mode)
  },

  /**
   * Send players away for the given number of game days.
   * @param {number[]} playerIds
   * @param {number} days
   * @param {Request} req
   * @returns {Promise<{sent: number}>}
   */
  async sendPlayersOnTour (playerIds, days, req) {
    const team = await getTeam(req)
    return await sendPlayersOnTour(team.id, playerIds, days)
  },

  /**
   * Call players back before their trip has started.
   * @param {number[]} playerIds
   * @param {Request} req
   * @returns {Promise<{recalled: number}>}
   */
  async recallPlayersFromTour (playerIds, req) {
    const team = await getTeam(req)
    return await recallPlayersFromTour(team.id, playerIds)
  }
}
