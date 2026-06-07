import { query } from '../lib/database.js'
import { calculateStanding } from '../lib/util.js'
import { getTeam } from '../helper/teamHelper.js'
import { getCachedStanding } from '../helper/standingHelper.js'
import { getTopScorers as getTopScorersFromCache } from '../helper/playerStatsHelper.js'

/**
 * @typedef {object} SeasonReviewType
 * @property {boolean} isSeasonEnd      true only when the live season just ended
 *                                       and a new one has not been created yet.
 *                                       The dashboard uses this to decide whether
 *                                       to auto-show the overlay.
 * @property {boolean} [available]      true when the response carries a populated
 *                                       review for the requested season. Lets the
 *                                       client tell "season ended now" apart from
 *                                       "an older season the user has finished".
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
 * Returns a snapshot of the user's outcome for a finished season.
 *
 * Two modes:
 *   - Without `season`: returns the just-finished live season's review and
 *     marks `isSeasonEnd:true`. Used by the dashboard's auto-show. Returns
 *     `{isSeasonEnd:false}` when there are unplayed games left or when the
 *     user has no team yet.
 *   - With `season`: looks up the review for that specific past season by
 *     finding which level/league the user's team played in *that* season,
 *     and computes outcome from the standing of that historical league.
 *
 * @param {number|null} [season] - Specific season to look up. null/undefined
 *                                  triggers auto-detect of the just-finished
 *                                  season.
 * @param {Request} req
 * @returns {Promise<SeasonReviewType>}
 */
async function getSeasonReview (season, req) {
  if (!req?.user) return { isSeasonEnd: false }

  // Manual lookup ignores the unplayed-games gate: the user is explicitly
  // asking for a past season's review (e.g. via the results page button).
  const explicitSeason = typeof season === 'number'

  let isSeasonEnd = false
  if (!explicitSeason) {
    const [{ unplayedCount }] = await query(
      'SELECT COUNT(*) AS unplayedCount FROM game WHERE played=0'
    )
    if (Number(unplayedCount) > 0) return { isSeasonEnd: false }
    isSeasonEnd = true
  }

  const team = await getTeam(req)
  if (!team) return { isSeasonEnd }

  // Figure out which (level, league) the user's team belonged to for this
  // season. For the just-finished season this matches team.level/league (no
  // promotion has been applied yet). For older seasons we look it up from
  // any league game the team played that season.
  let userLevel = team.level
  let userLeague = team.league
  let targetSeason = season
  if (explicitSeason) {
    const [row] = await query(
      "SELECT level, league FROM game WHERE season=? AND (team_1_id=? OR team_2_id=?) AND (game_type='league' OR game_type IS NULL) AND played=1 LIMIT 1",
      [season, team.id, team.id]
    )
    if (!row) return { isSeasonEnd, available: false }
    userLevel = row.level
    userLeague = row.league
  } else {
    const [lastSeasonRow] = await query(
      "SELECT MAX(season) AS season FROM game WHERE played=1 AND (game_type='league' OR game_type IS NULL) AND level=? AND league=?",
      [team.level, team.league]
    )
    if (lastSeasonRow?.season == null) return { isSeasonEnd, available: false }
    targetSeason = lastSeasonRow.season
  }

  // Get the final standing from the cache if available; otherwise compute it.
  const [lastGameDayRow] = await query(
    "SELECT MAX(game_day) AS gameDay FROM game WHERE season=? AND level=? AND league=? AND played=1 AND (game_type='league' OR game_type IS NULL)",
    [targetSeason, userLevel, userLeague]
  )
  const finalGameDay = lastGameDayRow?.gameDay ?? 0

  let standing = await getCachedStanding(finalGameDay, targetSeason, userLevel, userLeague)
  if (!standing) {
    const games = await query(
      `SELECT * FROM game
       WHERE season=? AND level=? AND league=? AND played=1
       AND (game_type='league' OR game_type IS NULL)`,
      [targetSeason, userLevel, userLeague]
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
    [targetSeason]
  )

  const topScorers = await getTopScorersFromCache(targetSeason, userLevel, userLeague, 1)

  const [maxLevelRow] = await query('SELECT MAX(level) AS maxLevel FROM team')
  const maxLevel = maxLevelRow?.maxLevel ?? userLevel

  const totalTeams = standing.length || 18
  const promotionCutoff = 2
  const relegationCutoff = 4
  let outcome
  if (position === 1 && userLevel === 0) {
    outcome = 'champion'
  } else if (position > 0 && position <= promotionCutoff && userLevel > 0) {
    outcome = 'promoted'
  } else if (position > 0 && position > totalTeams - relegationCutoff && userLevel < maxLevel) {
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

  const relegatedTeams = userLevel < maxLevel && standing.length >= relegationCutoff
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
    isSeasonEnd,
    available: true,
    season: targetSeason,
    team: {
      id: team.id,
      name: team.name,
      color: team.color,
      emblem: team.emblem,
      level: userLevel,
      league: userLeague
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
