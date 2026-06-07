import { query } from '../lib/database.js'
import { calculateStanding } from '../lib/util.js'
import { getTeam } from '../helper/teamHelper.js'
import { getCachedStanding } from '../helper/standingHelper.js'
import { getTopScorers as getTopScorersFromCache } from '../helper/playerStatsHelper.js'

/**
 * @typedef {object} SeasonReviewType
 * @property {boolean} isSeasonEnd
 * @property {number} [season]
 * @property {{id:number,name:string,color:string,emblem:string,level:number,league:number}} [team]
 * @property {number} [position]
 * @property {'champion'|'promoted'|'upperHalf'|'lowerHalf'|'relegated'} [outcome]
 * @property {boolean} [userWonCup]
 * @property {object|null} [leagueChampion]
 * @property {Array<object>} [relegatedTeams]
 * @property {object|null} [topScorer]
 * @property {object|null} [cupWinner]
 */

/**
 * Returns a snapshot of the just-finished season for the user — used to drive
 * the season-review overlay on the dashboard. Only meaningful while the season
 * is over (no unplayed games yet) and before prepare-season has created the
 * next one; at any other time `isSeasonEnd:false` is returned so the client
 * can skip rendering the overlay.
 * @param {Request} req
 * @returns {Promise<SeasonReviewType>}
 */
async function getSeasonReview (req) {
  if (!req?.user) return { isSeasonEnd: false }

  const [{ unplayedCount }] = await query(
    'SELECT COUNT(*) AS unplayedCount FROM game WHERE played=0'
  )
  if (Number(unplayedCount) > 0) return { isSeasonEnd: false }

  const team = await getTeam(req)
  if (!team) return { isSeasonEnd: false }

  // The just-finished league season for the user's current level/league. After
  // the season ends but before prepare-season runs, team.level/team.league
  // still reflect where the team played, so we can look up the right league.
  const [lastSeasonRow] = await query(
    "SELECT MAX(season) AS season, MAX(game_day) AS gameDay FROM game WHERE played=1 AND (game_type='league' OR game_type IS NULL) AND level=? AND league=?",
    [team.level, team.league]
  )
  if (lastSeasonRow?.season == null) return { isSeasonEnd: false }
  const season = lastSeasonRow.season

  // Get the final standing from the cache if available; otherwise compute it.
  const [lastGameDayRow] = await query(
    "SELECT MAX(game_day) AS gameDay FROM game WHERE season=? AND level=? AND league=? AND played=1 AND (game_type='league' OR game_type IS NULL)",
    [season, team.level, team.league]
  )
  const finalGameDay = lastGameDayRow?.gameDay ?? 0

  let standing = await getCachedStanding(finalGameDay, season, team.level, team.league)
  if (!standing) {
    const games = await query(
      `SELECT * FROM game
       WHERE season=? AND level=? AND league=? AND played=1
       AND (game_type='league' OR game_type IS NULL)`,
      [season, team.level, team.league]
    )
    if (games.length > 0) {
      const teamIds = new Set()
      games.forEach(g => { teamIds.add(g.team_1_id); teamIds.add(g.team_2_id) })
      const teams = await query(
        `SELECT * FROM team WHERE id IN (${[...teamIds].join(', ')})`
      )
      standing = calculateStanding(games, teams)
    } else {
      standing = []
    }
  }

  // Refresh team display fields in the standing entries — the cache may hold
  // stale names/emblems if a team was renamed mid-season.
  if (standing.length > 0) {
    const teamIds = standing.filter(s => s.team?.id).map(s => s.team.id)
    if (teamIds.length > 0) {
      const freshTeams = await query(
        `SELECT id, name, short_name, emblem, color FROM team WHERE id IN (${teamIds.join(', ')})`
      )
      const teamMap = Object.fromEntries(freshTeams.map(t => [t.id, t]))
      for (const entry of standing) {
        const fresh = entry.team?.id ? teamMap[entry.team.id] : null
        if (fresh) {
          entry.team.name = fresh.name
          entry.team.short_name = fresh.short_name
          entry.team.emblem = fresh.emblem
          entry.team.color = fresh.color
        }
      }
    }
  }

  const position = standing.findIndex(s => s.team?.id === team.id) + 1

  // Cup winner — read from the frozen season_title row populated right after
  // the cup final was played. Missing row = no cup played in this season yet.
  const [cupWinnerRow] = await query(
    `SELECT st.team_id, st.user_id,
            t.name AS team_name, t.emblem, t.color,
            u.username
     FROM season_title st
     LEFT JOIN team t ON t.id = st.team_id
     LEFT JOIN user u ON u.id = st.user_id
     WHERE st.season=? AND st.title_type='cup_winner' LIMIT 1`,
    [season]
  )

  // Top scorer of the user's league
  const topScorers = await getTopScorersFromCache(season, team.level, team.league, 1)

  // Max level (deepest league) — used to decide whether the team could relegate
  const [maxLevelRow] = await query('SELECT MAX(level) AS maxLevel FROM team')
  const maxLevel = maxLevelRow?.maxLevel ?? team.level

  // Outcome classification. Promotion/relegation here is the *implied* outcome
  // based on the final standing — prepare-season has not run yet, so the
  // team's level/league are still pre-promotion/relegation.
  const totalTeams = standing.length || 18
  const promotionCutoff = 2
  const relegationCutoff = 4
  let outcome
  if (position === 1 && team.level === 0) {
    outcome = 'champion'
  } else if (position > 0 && position <= promotionCutoff && team.level > 0) {
    outcome = 'promoted'
  } else if (position > 0 && position > totalTeams - relegationCutoff && team.level < maxLevel) {
    outcome = 'relegated'
  } else if (position > 0 && position <= Math.floor(totalTeams / 2)) {
    outcome = 'upperHalf'
  } else {
    outcome = 'lowerHalf'
  }

  const leagueChampion = standing[0]?.team
    ? {
      teamId: standing[0].team.id,
      teamName: standing[0].team.name,
      emblem: standing[0].team.emblem,
      color: standing[0].team.color,
      points: standing[0].points,
      isUser: standing[0].team.id === team.id
    }
    : null

  const relegatedTeams = team.level < maxLevel && standing.length >= relegationCutoff
    ? standing.slice(-relegationCutoff).map(s => ({
      teamId: s.team?.id,
      teamName: s.team?.name,
      emblem: s.team?.emblem,
      color: s.team?.color,
      isUser: s.team?.id === team.id
    })).filter(t => t.teamId)
    : []

  const topScorer = topScorers[0]
    ? {
      id: topScorers[0].id,
      name: topScorers[0].name,
      goals: topScorers[0].goals,
      team: topScorers[0].team,
      isUserTeam: topScorers[0].team?.id === team.id
    }
    : null

  const cupWinner = cupWinnerRow
    ? {
      teamId: cupWinnerRow.team_id,
      teamName: cupWinnerRow.team_name,
      emblem: cupWinnerRow.emblem,
      color: cupWinnerRow.color,
      username: cupWinnerRow.username || null,
      isUser: cupWinnerRow.team_id === team.id
    }
    : null

  return {
    isSeasonEnd: true,
    season,
    team: {
      id: team.id,
      name: team.name,
      color: team.color,
      emblem: team.emblem,
      level: team.level,
      league: team.league
    },
    position,
    outcome,
    userWonCup: !!cupWinner?.isUser,
    leagueChampion,
    relegatedTeams,
    topScorer,
    cupWinner
  }
}

export default {
  getSeasonReview
}
