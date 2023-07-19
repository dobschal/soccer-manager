import { Sponsor } from '../entities/sponsor.js'
import { getSponsor } from '../helper/sponsorHelper.js'
import { query } from '../lib/database.js'
import { sponsorNames } from '../lib/name-library.js'
import { randomItem } from '../lib/util.js'

export default {

  async getSponsor (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=?', [req.user.id])
    return await getSponsor(team)
  },

  async getSponsorOffers (req) {
    //
    // TODO: Cache the response per team to have the same sponsor after reload...
    //
    /** @type {Array<import('../entities/team.js').TeamType>} */
    const [team] = await query('SELECT * FROM team WHERE user_id=?', [req.user.id])
    const [game] = await query('SELECT * FROM game g ORDER BY g.season DESC LIMIT 1')
    const season = game?.season ?? 0
    const gameDay = game?.game_day ?? 0
    const games = await query('SELECT * FROM game WHERE (team_1_id=? OR team_2_id=?) AND played=1 ORDER BY season DESC, game_day DESC', [team.id, team.id])
    const contractLengths = [
      3, 9, 16, 34
    ]
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
    return { sponsors }
  },

  async chooseSponsor (req) {
    //
    // TODO: Secure that route
    //
    const sponsor = new Sponsor(req.body.sponsor)
    await query('INSERT INTO sponsor SET?', sponsor)
    return true
  }
}
