import { UnauthorizedError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import {
  getCupGamesForTeam,
  getCupResultsForRound,
  getCupRoundsForSeason,
  getCupSeasons,
  getCupBracket
} from '../helper/cupHelper.js'

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

    return {
      results,
      round: roundInfo,
      rounds,
      season: actualSeason
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
    const { season } = await getGameDayAndSeason()

    const games = await getCupGamesForTeam(team.id, season, limit)

    // Also get games from previous season if current season has few games
    let allGames = games
    if (games.length < limit && season > 0) {
      const prevSeasonGames = await getCupGamesForTeam(team.id, season - 1, limit - games.length)
      allGames = [...prevSeasonGames, ...games]
    }

    return { games: allGames }
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

    return { rounds, season: actualSeason }
  }
}
