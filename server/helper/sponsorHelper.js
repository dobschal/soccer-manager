import { query } from '../lib/database.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { randomItem } from '../lib/util.js'
import { sponsorNames } from '../lib/name-library.js'
import { Sponsor } from '../entities/sponsor.js'

const GAMEDAYS_PER_SEASON = 34

/**
 * Get the active sponsor for a team
 * @param {TeamType} team
 * @param {Object} [options] - Optional parameters for specific game day calculation
 * @param {number} [options.gameDay] - Specific game day to check
 * @param {number} [options.season] - Specific season to check
 * @returns {Promise<{sponsor: (SponsorType & {remaining_days: number}) | null}>}
 */
export async function getSponsor (team, options = {}) {
  const current = await getGameDayAndSeason()
  const gameDay = options.gameDay ?? current.gameDay
  const season = options.season ?? current.season

  const [sponsor] = await query(`
      SELECT s.*
      FROM sponsor s
      WHERE s.team_id = ?
      ORDER BY s.id DESC
      LIMIT 1;
  `, [team.id])

  if (sponsor) {
    // Calculate remaining days
    const contractEndTotal = sponsor.start_season * GAMEDAYS_PER_SEASON + sponsor.start_game_day + sponsor.duration
    const currentTotal = season * GAMEDAYS_PER_SEASON + gameDay
    const remaining_days = contractEndTotal - currentTotal

    // If contract has expired (0 or negative days), return no sponsor
    if (remaining_days <= 0) {
      return { sponsor: null }
    }

    return {
      sponsor: {
        ...sponsor,
        remaining_days
      }
    }
  }

  return { sponsor: null }
}

/**
 * @param {TeamType} team
 * @returns {Promise<SponsorType[]>}
 */
export async function getSponsorOffers (team) {
  const {
    gameDay,
    season
  } = await getGameDayAndSeason()
  const games = await query('SELECT * FROM game WHERE (team_1_id=? OR team_2_id=?) AND played=1 ORDER BY season DESC, game_day DESC', [team.id, team.id])
  const contractLengths = [
    3, 9, 16, 34
  ]
  // amount of money needed to pay 11 players at level 10 per game day
  // in league two you just get 80% of it
  let moneyPerGameDay = 63437
  for (let i = 0; i < team.level; i++) {
    moneyPerGameDay *= 0.8 // for each level you get 20% less sponsor money
  }
  const sponsors = []
  contractLengths.forEach(length => {
    let countWonGames = 0
    for (let i = 0; i < length; i++) {
      const game = games[i]
      if (!game) continue
      let won = false
      if (game.team_1_id === team.id && game.goals_team_1 > game.goals_team_2) {
        won = true
      }
      if (game.team_2_id === team.id && game.goals_team_2 > game.goals_team_1) {
        won = true
      }
      if (won) countWonGames++
    }
    const value = Math.floor((Math.random() * 0.2 + 0.9) * moneyPerGameDay * Math.max(1 / 3, (countWonGames / length)))
    const name = randomItem(sponsorNames)
    const sponsor = new Sponsor({
      team_id: team.id,
      name,
      value,
      start_season: season,
      start_game_day: gameDay,
      duration: length
    })
    sponsors.push(sponsor)
  })
  return sponsors
}
