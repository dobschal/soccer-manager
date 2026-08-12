import { UnauthorizedError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import {
  claimLoginStreakRewards,
  getStreakLeaderboard,
  getStreakState,
  LOGIN_STREAK_REWARDS,
  openRewards,
  registerDailyLogin,
  REWARD_CYCLE_LENGTH
} from '../helper/loginStreakHelper.js'

/**
 * Milestones in the shape the client needs: the day, the category key used for
 * icons and headings, and the weighted card pool so the overlay can spell out
 * which cards are possible and how likely each one is (#501).
 * @returns {Array<{day: number, key: string, actions: Array<{action: string, chance: number}>}>}
 */
function milestonesForClient () {
  return LOGIN_STREAK_REWARDS.map(r => {
    const total = r.actions.reduce((sum, a) => sum + a.weight, 0)
    return {
      day: r.day,
      key: r.key,
      actions: r.actions.map(a => ({
        action: a.action,
        chance: total > 0 ? Math.round((a.weight / total) * 100) : 0
      }))
    }
  })
}

export default {

  /**
   * Register today's login (idempotent) and return everything the dashboard
   * progress bar needs (#501). `availableRewards` drives the gift on the bar:
   * milestones already reached but not collected yet.
   * @param {Request} req
   * @returns {Promise<{streak: number, cycleDay: number, cycleLength: number, claimed: number[], milestones: Array<{day: number, key: string, actions: Array<{action: string, chance: number}>}>, availableRewards: Array<{day: number, key: string}>, nextMilestone: number|null}>}
   */
  async getDailyLoginStatus (req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const { streak, cycleDay, claimed } = await registerDailyLogin(req.user.id)
    const nextMilestone = LOGIN_STREAK_REWARDS.find(r => r.day > cycleDay)?.day ?? null
    return {
      streak,
      cycleDay,
      cycleLength: REWARD_CYCLE_LENGTH,
      claimed,
      milestones: milestonesForClient(),
      availableRewards: openRewards(cycleDay, claimed).map(r => ({ day: r.day, key: r.key })),
      nextMilestone
    }
  },

  /**
   * Collect every reward the user has reached but not picked up yet (#501).
   * The cards come back as `pending` so the client reveals them in the same
   * flip overlay the mini game uses; `claimActionCard` then moves them into the
   * inventory.
   * @param {Request} req
   * @returns {Promise<{cards: Array<{id: number, action: string, day: number, key: string}>, claimed: number[], availableRewards: Array<{day: number, key: string}>, limitReached: boolean}>}
   */
  async claimDailyLoginReward (req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const team = await getTeam(req)
    const { cards, claimed, limitReached } = await claimLoginStreakRewards(req.user.id, team.id)
    const { cycleDay } = await getStreakState(req.user.id)
    return {
      cards,
      claimed,
      availableRewards: openRewards(cycleDay, claimed).map(r => ({ day: r.day, key: r.key })),
      limitReached
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
      milestones: milestonesForClient()
    }
  }
}
