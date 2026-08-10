import { query } from '../lib/database.js'
import { UnauthorizedError } from '../lib/errors.js'
import {
  getStreakLeaderboard,
  getStreakState,
  LOGIN_STREAK_REWARDS,
  registerDailyLogin,
  REWARD_CYCLE_LENGTH
} from '../helper/loginStreakHelper.js'

export default {

  /**
   * Register today's login (idempotent) and return everything the dashboard
   * progress bar needs (#501).
   * @param {Request} req
   * @returns {Promise<{streak: number, cycleDay: number, cycleLength: number, claimed: number[], milestones: Array<{day: number, key: string}>, newRewards: Array, nextMilestone: number|null}>}
   */
  async getDailyLoginStatus (req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const [team] = await query('SELECT id FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const { streak, cycleDay, claimed, newRewards } = await registerDailyLogin(req.user.id, team?.id ?? null)
    const nextMilestone = LOGIN_STREAK_REWARDS.find(r => r.day > cycleDay)?.day ?? null
    return {
      streak,
      cycleDay,
      cycleLength: REWARD_CYCLE_LENGTH,
      claimed,
      milestones: LOGIN_STREAK_REWARDS.map(r => ({ day: r.day, key: r.key })),
      newRewards,
      nextMilestone
    }
  },

  /**
   * Streak leaderboard for the daily-login overlay. `limit` defaults to the
   * top 10 shown inline; "view all" requests a larger slice.
   * @param {number} [limit]
   * @param {Request} req
   * @returns {Promise<{top: Array, me: object|null, total: number, streak: number, cycleDay: number, cycleLength: number, claimed: number[], milestones: Array}>}
   */
  async getLoginStreakLeaderboard (limit, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const [board, state] = await Promise.all([
      getStreakLeaderboard(req.user.id, limit),
      getStreakState(req.user.id)
    ])
    return {
      ...board,
      streak: state.streak,
      cycleDay: state.cycleDay,
      cycleLength: REWARD_CYCLE_LENGTH,
      claimed: state.claimed,
      milestones: LOGIN_STREAK_REWARDS.map(r => ({ day: r.day, key: r.key }))
    }
  }
}
