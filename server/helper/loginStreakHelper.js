import { query } from '../lib/database.js'
import { randomItem } from '../lib/util.js'
import { canReceiveActionCard } from './actionCardHelper.js'
import { getGameDayAndSeason } from './gameDayHelper.js'

/**
 * Length of a reward cycle in days. After day 30 the reward counter restarts
 * at 1 while the actual login streak keeps running (#501).
 */
export const REWARD_CYCLE_LENGTH = 30

/**
 * Milestones inside a cycle and the card pool each one draws from. One card is
 * picked at random from the pool when the milestone is reached.
 * @type {Array<{day: number, key: string, actions: string[]}>}
 */
export const LOGIN_STREAK_REWARDS = [
  { day: 3, key: 'recovery', actions: ['FRESHNESS_5', 'FRESHNESS_10', 'FRESHNESS_20'] },
  { day: 7, key: 'training', actions: ['LEVEL_UP_PLAYER_40', 'LEVEL_UP_PLAYER_70', 'LEVEL_UP_PLAYER_100'] },
  { day: 15, key: 'special', actions: ['BONUS_100K', 'SPY', 'MOTIVATING_SPEECH'] },
  { day: 30, key: 'youth', actions: ['NEW_YOUTH_PLAYER_1', 'NEW_YOUTH_PLAYER_2', 'NEW_YOUTH_PLAYER_3'] }
]

/**
 * Server-local calendar day as `YYYY-MM-DD`. The streak is deliberately
 * evaluated in server time so a user cannot gain a day by changing timezone.
 * @param {Date} [date]
 * @returns {string}
 */
export function toDateKey (date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Difference in whole calendar days between two `YYYY-MM-DD` keys.
 * @param {string} from
 * @param {string} to
 * @returns {number}
 */
export function dayDifference (from, to) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

/**
 * Normalize whatever the MySQL driver hands back for a DATE column — a Date in
 * some configurations, a plain `YYYY-MM-DD` string in others — to a date key.
 * @param {Date|string} value
 * @returns {string}
 */
function storedDateKey (value) {
  if (typeof value === 'string') return value.slice(0, 10)
  return toDateKey(new Date(value))
}

/**
 * Reward counter position for a streak length: 1..30, restarting after 30.
 * A streak of 43 days sits at 13 in the current cycle.
 * @param {number} streak
 * @returns {number}
 */
export function cycleDayForStreak (streak) {
  if (streak <= 0) return 0
  return ((streak - 1) % REWARD_CYCLE_LENGTH) + 1
}

/**
 * Parse the stored CSV of already-granted milestone days.
 * @param {string|null} value
 * @returns {number[]}
 */
function parseClaimed (value) {
  if (!value) return []
  return String(value).split(',').map(Number).filter(n => Number.isFinite(n) && n > 0)
}

/**
 * Register today's login for a user and hand out any milestone reward they
 * just unlocked (#501).
 *
 * Idempotent per calendar day: repeated calls on the same day (reload, second
 * device, revisiting the dashboard) change nothing and grant nothing. The
 * granted-milestone list is the second guard — even a same-day streak bump
 * could not hand the same reward out twice.
 *
 * @param {number} userId
 * @param {number|null} teamId - reward cards land in this team's inventory
 * @returns {Promise<{streak: number, cycleDay: number, claimed: number[], newRewards: Array<{day: number, key: string, action: string}>}>}
 */
export async function registerDailyLogin (userId, teamId) {
  // The same user can hit this from several requests at once (the auth
  // middleware and the dashboard endpoint fire together on app start). Without
  // serialising them both could pass the "not counted today" check and hand
  // out the milestone card twice.
  const inFlight = _inFlightRegistrations.get(userId)
  if (inFlight) return await inFlight
  const promise = (async () => {
    try {
      return await _registerDailyLogin(userId, teamId)
    } finally {
      _inFlightRegistrations.delete(userId)
    }
  })()
  _inFlightRegistrations.set(userId, promise)
  return await promise
}

/** @type {Map<number, Promise<object>>} */
const _inFlightRegistrations = new Map()

/**
 * @param {number} userId
 * @param {number|null} teamId
 * @returns {Promise<{streak: number, cycleDay: number, claimed: number[], newRewards: Array<{day: number, key: string, action: string}>}>}
 */
async function _registerDailyLogin (userId, teamId) {
  const today = toDateKey()
  const [row] = await query('SELECT * FROM user_login_streak WHERE user_id=? LIMIT 1', [userId])

  let streak
  let claimed
  if (!row) {
    streak = 1
    claimed = []
    await query('INSERT INTO user_login_streak SET ?', {
      user_id: userId,
      last_login_date: today,
      streak: 1,
      cycle_day: 1,
      longest_streak: 1,
      rewards_claimed: ''
    })
  } else {
    const lastDate = storedDateKey(row.last_login_date)
    const diff = dayDifference(lastDate, today)
    if (diff <= 0) {
      // Already counted today (or a clock skew into the past) — nothing to do.
      return {
        streak: row.streak,
        cycleDay: row.cycle_day,
        claimed: parseClaimed(row.rewards_claimed),
        newRewards: []
      }
    }
    if (diff === 1) {
      streak = row.streak + 1
      // Crossing into a new cycle wipes the granted list so the rewards can
      // be earned again.
      claimed = cycleDayForStreak(streak) === 1 ? [] : parseClaimed(row.rewards_claimed)
    } else {
      streak = 1
      claimed = []
    }
    await query(
      'UPDATE user_login_streak SET last_login_date=?, streak=?, cycle_day=?, longest_streak=GREATEST(longest_streak, ?), rewards_claimed=? WHERE user_id=?',
      [today, streak, cycleDayForStreak(streak), streak, claimed.join(','), userId]
    )
  }

  const cycleDay = cycleDayForStreak(streak)
  const newRewards = []
  const milestone = LOGIN_STREAK_REWARDS.find(r => r.day === cycleDay)
  if (milestone && !claimed.includes(milestone.day) && teamId) {
    const action = await _pickGrantableAction(teamId, milestone.actions)
    // Record the milestone even when no card could be handed out, so the user
    // does not get a second shot at it later in the same cycle.
    claimed = [...claimed, milestone.day]
    await query('UPDATE user_login_streak SET rewards_claimed=? WHERE user_id=?', [claimed.join(','), userId])
    if (action) {
      const { season } = await getGameDayAndSeason()
      await query('INSERT INTO action_card SET ?', {
        team_id: teamId,
        action,
        played: 0,
        state: 'pending',
        season
      })
      newRewards.push({ day: milestone.day, key: milestone.key, action })
    }
  }

  return { streak, cycleDay, claimed, newRewards }
}

/**
 * Pick a card from the pool the team can actually receive, so a reward never
 * lands as an unclaimable pending card. Returns null when the team is capped
 * on every option.
 * @param {number} teamId
 * @param {string[]} actions
 * @returns {Promise<string|null>}
 */
async function _pickGrantableAction (teamId, actions) {
  const available = []
  for (const action of actions) {
    if (await canReceiveActionCard(teamId, action)) available.push(action)
  }
  if (available.length === 0) return null
  return randomItem(available)
}

/**
 * Current streak state of a user without touching it.
 * @param {number} userId
 * @returns {Promise<{streak: number, cycleDay: number, claimed: number[]}>}
 */
export async function getStreakState (userId) {
  const [row] = await query('SELECT * FROM user_login_streak WHERE user_id=? LIMIT 1', [userId])
  if (!row) return { streak: 0, cycleDay: 0, claimed: [] }
  // A streak that was not continued yesterday or today is already broken —
  // report it as such instead of showing a stale number until the next login.
  const diff = dayDifference(storedDateKey(row.last_login_date), toDateKey())
  if (diff > 1) return { streak: 0, cycleDay: 0, claimed: [] }
  return { streak: row.streak, cycleDay: row.cycle_day, claimed: parseClaimed(row.rewards_claimed) }
}

/**
 * Top streak leaderboard plus the requesting user's own rank when they are
 * outside the returned slice. Only streaks still alive (logged in today or
 * yesterday) count.
 * @param {number} userId
 * @param {number} [limit]
 * @returns {Promise<{top: Array<{userId: number, username: string, streak: number, rank: number, isMe: boolean}>, me: ({rank: number, streak: number}|null), total: number}>}
 */
export async function getStreakLeaderboard (userId, limit = 10) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 10)))
  const rows = await query(
    `SELECT s.user_id, s.streak, u.username
     FROM user_login_streak s
     JOIN user u ON u.id = s.user_id
     WHERE s.streak > 0 AND s.last_login_date >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
     ORDER BY s.streak DESC, s.user_id ASC`
  )
  const ranked = rows.map((r, i) => ({
    userId: r.user_id,
    username: r.username,
    streak: r.streak,
    rank: i + 1,
    isMe: r.user_id === userId
  }))
  const top = ranked.slice(0, safeLimit)
  const mine = ranked.find(r => r.isMe)
  return {
    top,
    me: mine ? { rank: mine.rank, streak: mine.streak } : null,
    total: ranked.length
  }
}
