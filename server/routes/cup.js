import { UnauthorizedError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { query } from '../lib/database.js'
import {
  getCupGamesForTeam,
  getCupResultsForRound,
  getCupRoundsForSeason,
  getCupSeasons,
  getCupBracket,
  getTotalRoundsForSeason,
  getTotalRounds
} from '../helper/cupHelper.js'
import { getSeenGameIds } from '../helper/seenGameHelper.js'

export default {
  /**
   * Get cup results for a specific round in a season
   * @param {number} season
   * @param {number} round - Cup round number (1=final, 2=semi, etc.)
   * @param {Request} req
   * @returns {Promise<{results: Array, round: Object}>}
   */
  async getCupResults (season, round, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const { season: currentSeason } = await getGameDayAndSeason()
    const actualSeason = season ?? currentSeason

    // Get available rounds for this season
    const rounds = await getCupRoundsForSeason(actualSeason)

    if (rounds.length === 0) {
      return { results: [], round: null, rounds: [], season: actualSeason }
    }

    // Default to the most recent round if not specified
    const actualRound = round ?? rounds[0].round

    const results = await getCupResultsForRound(actualSeason, actualRound)
    const roundInfo = rounds.find(r => r.round === actualRound)

    const maxRound = Math.max(...rounds.map(r => r.round))
    const totalRounds = getTotalRounds(maxRound)
    return {
      results,
      round: roundInfo,
      rounds,
      season: actualSeason,
      totalRounds
    }
  },

  /**
   * Get cup games for the user's team (for dashboard slider)
   * @param {number} limit - Maximum number of games to return
   * @param {Request} req
   * @returns {Promise<{games: Array}>}
   */
  async getMyCupGames (limit = 10, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const team = await getTeam(req)
    const { season, gameDay: currentGameDay } = await getGameDayAndSeason()

    const games = await getCupGamesForTeam(team.id, season, limit)

    // Calculate gameDate for unplayed cup games based on offset from current game day
    // Each game day is 12 hours apart (one cron tick)
    const nextTick = new Date()
    nextTick.setHours(12)
    nextTick.setMinutes(0)
    nextTick.setSeconds(0)
    if (Date.now() > nextTick.getTime()) {
      nextTick.setHours(23)
      nextTick.setMinutes(59)
      nextTick.setSeconds(59)
    }

    const gamesWithDates = games.map(game => {
      if (game.played) return game
      const gameDate = new Date(nextTick)
      const dayOffset = game.gameDay - currentGameDay
      gameDate.setTime(gameDate.getTime() + dayOffset * 12 * 60 * 60 * 1000)
      return { ...game, gameDate }
    })

    const playedIds = gamesWithDates.filter(g => g.played).map(g => g.id)
    const seenIds = await getSeenGameIds(team.id, playedIds)
    const gamesWithSeen = gamesWithDates.map(g => g.played ? { ...g, seen: seenIds.has(g.id) } : g)

    const totalRounds = await getTotalRoundsForSeason(season)

    return { games: gamesWithSeen, totalRounds }
  },

  /**
   * Get the full cup bracket structure for a season
   * @param {number} season
   * @param {Request} req
   * @returns {Promise<{bracket: Object, season: number}>}
   */
  async getCupBracket (season, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const { season: currentSeason } = await getGameDayAndSeason()
    const actualSeason = season ?? currentSeason

    const bracket = await getCupBracket(actualSeason)

    return { bracket, season: actualSeason }
  },

  /**
   * Get all seasons that have cup data
   * @param {Request} req
   * @returns {Promise<{seasons: number[]}>}
   */
  async getAvailableCupSeasons (req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const seasons = await getCupSeasons()

    return { seasons }
  },

  /**
   * Get all cup rounds for a season
   * @param {number} season
   * @param {Request} req
   * @returns {Promise<{rounds: Array, season: number}>}
   */
  async getCupRounds (season, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const { season: currentSeason } = await getGameDayAndSeason()
    const actualSeason = season ?? currentSeason

    const rounds = await getCupRoundsForSeason(actualSeason)
    const maxRound = rounds.length > 0 ? Math.max(...rounds.map(r => r.round)) : 0
    const totalRounds = getTotalRounds(maxRound)

    return { rounds, season: actualSeason, totalRounds }
  },

  /**
   * Get suspended players from teams in a specific cup round
   * @param {number} season
   * @param {number} round - Cup round number (power of 2)
   * @param {Request} req
   * @returns {Promise<{suspendedPlayers: Array}>}
   */
  async getSuspendedPlayersForCup (season, round, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const { season: currentSeason } = await getGameDayAndSeason()
    const actualSeason = season ?? currentSeason

    const suspendedPlayers = await query(`
        SELECT p.*, t.name as team_name, t.color as team_color, t.emblem as team_emblem
        FROM player p
                 JOIN team t ON t.id = p.team_id
        WHERE p.is_suspended = 1
          AND t.id IN (
            SELECT team_1_id FROM game WHERE season = ? AND game_type = 'cup' AND cup_round = ?
            UNION
            SELECT team_2_id FROM game WHERE season = ? AND game_type = 'cup' AND cup_round = ? AND team_2_id IS NOT NULL
          )
        ORDER BY t.name, p.name
    `, [actualSeason, round, actualSeason, round])

    return {
      suspendedPlayers: suspendedPlayers.map(p => ({
        ...p,
        team: {
          id: p.team_id,
          name: p.team_name,
          color: p.team_color,
          emblem: p.team_emblem
        }
      }))
    }
  },

  /**
   * Get injured players from teams in a specific cup round
   * @param {number} season
   * @param {number} round - Cup round number (power of 2)
   * @param {Request} req
   * @returns {Promise<{injuredPlayers: Array}>}
   */
  async getInjuredPlayersForCup (season, round, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const { season: currentSeason } = await getGameDayAndSeason()
    const actualSeason = season ?? currentSeason

    const injuredPlayers = await query(`
        SELECT p.*, t.name as team_name, t.color as team_color, t.emblem as team_emblem
        FROM player p
                 JOIN team t ON t.id = p.team_id
        WHERE p.is_injured = 1
          AND t.id IN (
            SELECT team_1_id FROM game WHERE season = ? AND game_type = 'cup' AND cup_round = ?
            UNION
            SELECT team_2_id FROM game WHERE season = ? AND game_type = 'cup' AND cup_round = ? AND team_2_id IS NOT NULL
          )
        ORDER BY t.name, p.name
    `, [actualSeason, round, actualSeason, round])

    return {
      injuredPlayers: injuredPlayers.map(p => ({
        ...p,
        team: {
          id: p.team_id,
          name: p.team_name,
          color: p.team_color,
          emblem: p.team_emblem
        }
      }))
    }
  }
}
