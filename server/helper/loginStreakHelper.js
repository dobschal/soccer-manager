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
 * Milestones inside a cycle and the weighted card pool each one draws from. One
 * card is drawn per milestone; `weight` is the intended percentage chance
 * within that pool. When the team is capped on some of the options the
 * remaining weights are renormalized, so a pool always yields a card as long as
 * one option is grantable (#501).
 * @type {Array<{day: number, key: string, actions: Array<{action: string, weight: number}>}>}
 */
export const LOGIN_STREAK_REWARDS = [
  {
    day: 3,
    key: 'recovery',
    actions: [
      { action: 'FRESHNESS_5', weight: 50 },
      { action: 'FRESHNESS_10', weight: 30 },
      { action: 'FRESHNESS_20', weight: 20 }
    ]
  },
  {
    day: 7,
    key: 'training',
    actions: [
      { action: 'LEVEL_UP_PLAYER_40', weight: 50 },
      { action: 'LEVEL_UP_PLAYER_70', weight: 30 },
      { action: 'LEVEL_UP_PLAYER_100', weight: 20 }
    ]
  },
  {
    day: 15,
    key: 'special',
    actions: [
      { action: 'BONUS_100K', weight: 30 },
      { action: 'SPY', weight: 30 },
      { action: 'MOTIVATING_SPEECH', weight: 30 },
      { action: 'STAR_PLAYER', weight: 10 }
    ]
  },
  {
    // Was a youth-card pool until youth cards turned out to be far too common
    // across all sources; this milestone now hands out training instead, tilted
    // to the higher tiers so day 23 still beats the day 7 training reward.
    day: 23,
    key: 'training',
    actions: [
      { action: 'LEVEL_UP_PLAYER_40', weight: 30 },
      { action: 'LEVEL_UP_PLAYER_70', weight: 40 },
      { action: 'LEVEL_UP_PLAYER_100', weight: 30 }
    ]
  },
  {
    day: 30,
    key: 'jackpot',
    actions: [
      { action: 'MILLION_BONUS', weight: 70 },
      { action: 'STAR_PLAYER', weight: 30 }
    ]
  }
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
 * Milestones of the current cycle that the user has reached but not collected
 * yet. Rewards are handed out on demand (the gift on the dashboard bar), so a
 * milestone stays open until the user actually taps it — or until the cycle
 * rolls over and wipes the progress (#501).
 * @param {number} cycleDay
 * @param {number[]} claimed
 * @returns {Array<{day: number, key: string, actions: Array<{action: string, weight: number}>}>}
 */
export function openRewards (cycleDay, claimed) {
  return LOGIN_STREAK_REWARDS.filter(r => r.day <= cycleDay && !claimed.includes(r.day))
}

/**
 * Register today's login for a user (#501).
 *
 * Idempotent per calendar day: repeated calls on the same day (reload, second
 * device, revisiting the dashboard) change nothing. This only advances the
 * streak — the milestone cards are handed out by `claimLoginStreakRewards`
 * when the user collects the gift.
 *
 * @param {number} userId
 * @returns {Promise<{streak: number, cycleDay: number, claimed: number[]}>}
 */
export async function registerDailyLogin (userId) {
  // The same user can hit this from several requests at once (the auth
  // middleware and the dashboard endpoint fire together on app start). Without
  // serialising them both could pass the "not counted today" check and bump
  // the streak twice.
  const inFlight = _inFlightRegistrations.get(userId)
  if (inFlight) return await inFlight
  const promise = (async () => {
    try {
      return await _registerDailyLogin(userId)
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
 * @returns {Promise<{streak: number, cycleDay: number, claimed: number[]}>}
 */
async function _registerDailyLogin (userId) {
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
        claimed: parseClaimed(row.rewards_claimed)
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

  return { streak, cycleDay: cycleDayForStreak(streak), claimed }
}

/** @type {Map<number, Promise<object>>} */
const _inFlightClaims = new Map()

/**
 * Hand out the cards for every milestone the user has reached but not yet
 * collected (#501). Triggered by the user tapping the gift on the dashboard
 * bar — nothing is granted just by opening the app.
 *
 * The cards land as `pending`, exactly like the mini-game reward, so the user
 * still flips them open in the claim overlay.
 *
 * @param {number} userId
 * @param {number} teamId - reward cards land in this team's inventory
 * @returns {Promise<{cards: Array<{id: number, action: string, day: number, key: string}>, claimed: number[], limitReached: boolean}>}
 */
export async function claimLoginStreakRewards (userId, teamId) {
  // A double tap on the gift would otherwise run both passes against the same
  // `rewards_claimed` value and hand the milestone out twice.
  const inFlight = _inFlightClaims.get(userId)
  if (inFlight) return await inFlight
  const promise = (async () => {
    try {
      return await _claimLoginStreakRewards(userId, teamId)
    } finally {
      _inFlightClaims.delete(userId)
    }
  })()
  _inFlightClaims.set(userId, promise)
  return await promise
}

/**
 * @param {number} userId
 * @param {number} teamId
 * @returns {Promise<{cards: Array<{id: number, action: string, day: number, key: string}>, claimed: number[], limitReached: boolean}>}
 */
async function _claimLoginStreakRewards (userId, teamId) {
  const { cycleDay, claimed: alreadyClaimed } = await getStreakState(userId)
  let claimed = alreadyClaimed
  const cards = []
  let limitReached = false

  for (const milestone of openRewards(cycleDay, claimed)) {
    const action = await _pickGrantableAction(teamId, milestone.actions)
    if (!action) {
      // Every option of this pool is capped. Leave the milestone open instead
      // of burning it — the user can collect it once a card slot frees up.
      limitReached = true
      break
    }
    const { season } = await getGameDayAndSeason()
    const result = await query('INSERT INTO action_card SET ?', {
      team_id: teamId,
      action,
      played: 0,
      state: 'pending',
      season
    })
    claimed = [...claimed, milestone.day]
    cards.push({ id: result.insertId, action, day: milestone.day, key: milestone.key })
  }

  if (cards.length > 0) {
    await query('UPDATE user_login_streak SET rewards_claimed=? WHERE user_id=?', [claimed.join(','), userId])
  }
  return { cards, claimed, limitReached }
}

/**
 * Pick a card from the weighted pool, restricted to the ones the team can
 * actually receive so a reward never lands as an unclaimable pending card.
 * Weights of the remaining options are renormalized against their own sum.
 * Returns null when the team is capped on every option.
 * @param {number} teamId
 * @param {Array<{action: string, weight: number}>} actions
 * @returns {Promise<string|null>}
 */
async function _pickGrantableAction (teamId, actions) {
  const available = []
  for (const entry of actions) {
    if (await canReceiveActionCard(teamId, entry.action)) available.push(entry)
  }
  return pickWeightedAction(available)
}

/**
 * Draw one action from a weighted list. Entries without a positive weight are
 * treated as equally likely, so a malformed pool still yields a card.
 * @param {Array<{action: string, weight: number}>} entries
 * @returns {string|null}
 */
export function pickWeightedAction (entries) {
  if (!entries || entries.length === 0) return null
  const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight || 0), 0)
  if (total <= 0) return randomItem(entries).action
  let roll = Math.random() * total
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight || 0)
    if (roll < 0) return entry.action
  }
  return entries[entries.length - 1].action
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
