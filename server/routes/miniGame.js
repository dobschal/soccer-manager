import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import {
  rollMiniGameReward,
  validateMiniGameSubmission,
  hasReceivedMiniGameRewardThisGameDay
} from '../helper/miniGameHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { canReceiveActionCard } from '../helper/actionCardHelper.js'
import { t } from '../i18n/index.js'

function leaderboardSql (todayOnly) {
  const where = todayOnly ? 'WHERE DATE(s.played_at) = CURDATE()' : ''
  return `
    SELECT team_id, score, goals_scored, played_at, team_name, emblem, username FROM (
      SELECT s.team_id, s.score, s.goals_scored, s.played_at, t.name AS team_name, t.emblem, u.username,
             ROW_NUMBER() OVER (PARTITION BY s.team_id ORDER BY s.score DESC, s.played_at ASC) AS rn
      FROM mini_game_score s
      INNER JOIN team t ON t.id = s.team_id
      LEFT JOIN user u ON u.id = t.user_id
      ${where}
    ) ranked
    WHERE rn = 1
    ORDER BY score DESC, played_at ASC
    LIMIT 10
  `
}

export default {

  /**
   * @param {number} score
   * @param {number} goalsScored
   * @param {number} durationMs
   * @param {Request} req
   * @returns {Promise<{success: boolean, awardedCard: ({id:number,action:string}|null), isBlank: boolean, gameDayRewardUsed: boolean, leaderboardRank: number|null, isPersonalBest: boolean}>}
   */
  async submitMiniGameScore (score, goalsScored, durationMs, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)

    const validation = validateMiniGameSubmission(score, goalsScored, durationMs)
    if (!validation.valid) {
      throw new BadRequestError(`Invalid mini-game submission: ${validation.reason}`)
    }

    const { gameDay, season } = await getGameDayAndSeason()

    const insertResult = await query(
      'INSERT INTO mini_game_score SET ?',
      { team_id: team.id, score, goals_scored: goalsScored, duration_ms: durationMs, game_day: gameDay, season }
    )
    const scoreId = insertResult.insertId

    let awardedCard = null
    let gameDayRewardUsed = false
    if (await hasReceivedMiniGameRewardThisGameDay(team.id, gameDay, season)) {
      gameDayRewardUsed = true
    } else {
      const action = rollMiniGameReward(goalsScored)
      // Don't hand out a card the team already holds the max of — it could
      // never be claimed and would hang on `pending` on the dashboard.
      if (action && await canReceiveActionCard(team.id, action)) {
        const cardResult = await query(
          'INSERT INTO action_card SET ?',
          { team_id: team.id, action, played: 0, state: 'pending', season }
        )
        const cardId = cardResult.insertId
        await query('UPDATE mini_game_score SET rewarded_card_id=? WHERE id=?', [cardId, scoreId])
        awardedCard = { id: cardId, action }
      }
    }

    const [rankRow] = await query(
      `SELECT (COUNT(*) + 1) AS leaderboard_rank
       FROM (
         SELECT MAX(score) AS best
         FROM mini_game_score
         WHERE team_id <> ?
         GROUP BY team_id
       ) b
       WHERE b.best > (SELECT MAX(score) FROM mini_game_score WHERE team_id = ?)`,
      [team.id, team.id]
    )
    const [bestRow] = await query(
      'SELECT MAX(score) AS best FROM mini_game_score WHERE team_id=? AND id <> ?',
      [team.id, scoreId]
    )
    const isPersonalBest = bestRow?.best == null || score > bestRow.best

    return {
      success: true,
      awardedCard,
      isBlank: !awardedCard && !gameDayRewardUsed,
      gameDayRewardUsed,
      leaderboardRank: rankRow?.leaderboard_rank ?? null,
      isPersonalBest
    }
  },

  /**
   * @param {Request} req
   * @returns {Promise<{success: boolean, topAllTime: Array, topToday: Array, myBest: number|null}>}
   */
  async getMiniGameLeaderboard (req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)

    const [topAllTime, topToday, myBestRows] = await Promise.all([
      query(leaderboardSql(false)),
      query(leaderboardSql(true)),
      query('SELECT MAX(score) AS best FROM mini_game_score WHERE team_id=?', [team.id])
    ])

    const decorate = rows => rows.map(r => ({
      teamId: r.team_id,
      teamName: r.team_name,
      emblem: r.emblem,
      username: r.username,
      score: r.score,
      goalsScored: r.goals_scored,
      playedAt: r.played_at,
      isMyTeam: r.team_id === team.id
    }))

    return {
      success: true,
      topAllTime: decorate(topAllTime),
      topToday: decorate(topToday),
      myBest: myBestRows[0]?.best ?? null
    }
  }
}
