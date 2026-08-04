import { query } from '../lib/database.js'
import { getGameDayAndSeason, getSeasonGameDayCount } from './gameDayHelper.js'
import { randomItem } from '../lib/util.js'
import { sponsorNames } from '../lib/name-library.js'
import { Sponsor } from '../entities/sponsor.js'

/**
 * Number of ticks elapsed from (startSeason, startGameDay) to (currentSeason, currentGameDay).
 * Each tick advances the unplayed-game-day pointer by one within a season or wraps to game day 1
 * of the next. Season lengths vary because cup rounds are interleaved between league days, so a
 * fixed 34 would miscount across the season boundary.
 *
 * @param {number} startSeason
 * @param {number} startGameDay
 * @param {number} currentSeason
 * @param {number} currentGameDay
 * @returns {Promise<number>}
 */
async function _ticksElapsed (startSeason, startGameDay, currentSeason, currentGameDay) {
  if (currentSeason === startSeason) {
    return currentGameDay - startGameDay
  }
  let ticks = await getSeasonGameDayCount(startSeason) - startGameDay
  for (let s = startSeason + 1; s < currentSeason; s++) {
    ticks += await getSeasonGameDayCount(s)
  }
  return ticks + currentGameDay
}

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
    const ticksElapsed = await _ticksElapsed(
      sponsor.start_season, sponsor.start_game_day, season, gameDay
    )
    const remaining_days = sponsor.duration - ticksElapsed

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
  // Only competitive games count towards the offer. Friendlies are self-scheduled
  // (one per game day, plus unlimited appearances as someone else's opponent), so
  // counting them would let a team farm its win rate and crowd real league/cup
  // results out of the 34-game window. A NULL game_type is a legacy league game
  // from before the game_type column existed.
  const gameTypeFilter = '(game_type IN (\'league\', \'cup\') OR game_type IS NULL)'
  const games = await query(`
    (SELECT * FROM game WHERE team_1_id=? AND played=1 AND ${gameTypeFilter} ORDER BY season DESC, game_day DESC LIMIT 34)
    UNION ALL
    (SELECT * FROM game WHERE team_2_id=? AND played=1 AND ${gameTypeFilter} ORDER BY season DESC, game_day DESC LIMIT 34)
    ORDER BY season DESC, game_day DESC LIMIT 34
  `, [team.id, team.id])
  const contractLengths = [
    3, 9, 16, 34
  ]
  // amount of money needed to pay 11 players at level 10 per game day
  // in league two you just get 80% of it
  let moneyPerGameDay = 76124
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
