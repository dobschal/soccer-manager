import { query } from '../lib/database.js'

/**
 * @param {import('../entities/team.js').TeamType} team
 * @returns {Promise<{sponsor: import('../entities/sponsor.js').SponsorType}>}
 */
export async function getSponsor (team) {
  const [game] = await query('SELECT * FROM game g ORDER BY g.season DESC LIMIT 1')
  const season = game?.season ?? 0
  const gameDay = game?.game_day ?? 0

  /** @type {Array<import('../entities/sponsor.js').SponsorType>} */
  const sponsors = await query('SELECT * FROM sponsor WHERE team_id=?', [team.id])
  for (const sponsor of sponsors) {
    // older than one season
    if (sponsor.start_season < season - 1) continue
    // from last season
    if (sponsor.start_season === season - 1) {
      const leftOverDays = sponsor.start_game_day + sponsor.duration - 34
      if (leftOverDays >= gameDay) return { sponsor }
      continue
    }
    // from current season
    if (sponsor.start_season === season) {
      if (sponsor.start_game_day + sponsor.duration >= gameDay) {
        return { sponsor }
      }
    }
  }
  return {}
}
