import { query } from '../lib/database.js'
import { actionCardChances, canReceiveActionCard } from './actionCardHelper.js'
import { getGameDayAndSeason } from './gameDayHelper.js'

/**
 * Points needed between consecutive action card rewards.
 */
export const POINTS_PER_REWARD = 3

/**
 * Pool of action cards awarded to bettors. Mirrors the mini-game pool so the
 * payout feels consistent with other reward systems in the game.
 */
export const WORLD_CUP_REWARD_POOL = Object.entries(actionCardChances)
  .filter(([, chance]) => chance > 0)
  .map(([action]) => action)

const VALID_PREDICTIONS = new Set(['team_1', 'draw', 'team_2'])

/**
 * @param {string} prediction
 * @returns {boolean}
 */
export function isValidPrediction (prediction) {
  return VALID_PREDICTIONS.has(prediction)
}

/**
 * Determine the correct outcome for a completed game.
 * @param {number|null} goalsTeam1
 * @param {number|null} goalsTeam2
 * @returns {'team_1'|'draw'|'team_2'|null}
 */
export function outcomeFor (goalsTeam1, goalsTeam2) {
  if (goalsTeam1 === null || goalsTeam2 === null || goalsTeam1 === undefined || goalsTeam2 === undefined) {
    return null
  }
  if (goalsTeam1 > goalsTeam2) return 'team_1'
  if (goalsTeam1 < goalsTeam2) return 'team_2'
  return 'draw'
}

/**
 * Roll a random action card type from the world cup reward pool, weighted by
 * the normal per-game-day distribution.
 * @param {() => number} [random]
 * @returns {string}
 */
export function rollWorldCupReward (random = Math.random) {
  const totalWeight = WORLD_CUP_REWARD_POOL.reduce((sum, action) => sum + actionCardChances[action], 0)
  let r = random() * totalWeight
  for (const action of WORLD_CUP_REWARD_POOL) {
    r -= actionCardChances[action]
    if (r < 0) return action
  }
  return WORLD_CUP_REWARD_POOL[WORLD_CUP_REWARD_POOL.length - 1]
}

/**
 * Count how many correct bets the given user has so far.
 * @param {number} userId
 * @returns {Promise<number>}
 */
export async function getUserPoints (userId) {
  const [row] = await query(`
    SELECT COUNT(*) AS points
    FROM world_cup_bet b
    JOIN world_cup_game g ON g.id = b.game_id
    WHERE b.user_id = ?
      AND g.goals_team_1 IS NOT NULL
      AND g.goals_team_2 IS NOT NULL
      AND (
        (b.prediction = 'team_1' AND g.goals_team_1 > g.goals_team_2) OR
        (b.prediction = 'team_2' AND g.goals_team_2 > g.goals_team_1) OR
        (b.prediction = 'draw'   AND g.goals_team_1 = g.goals_team_2)
      )
  `, [userId])
  return Number(row?.points || 0)
}

/**
 * Check how many reward thresholds the user has already crossed (claimed cards).
 * @param {number} userId
 * @returns {Promise<number>}
 */
export async function getClaimedRewardCount (userId) {
  const [row] = await query('SELECT COUNT(*) AS amount FROM world_cup_reward_claim WHERE user_id = ?', [userId])
  return Number(row?.amount || 0)
}

/**
 * Issue any action cards that the user has newly earned. For every multiple of
 * `POINTS_PER_REWARD` points reached, one random reward card is granted. Cards
 * arrive in the same pending state as mini-game rewards so the dashboard's
 * claim overlay surfaces them on the next visit.
 *
 * @param {number} userId
 * @param {number} teamId
 * @returns {Promise<{ newCards: number, totalPoints: number, claimed: number }>}
 */
export async function awardWorldCupRewards (userId, teamId) {
  const points = await getUserPoints(userId)
  const claimed = await getClaimedRewardCount(userId)
  const eligible = Math.floor(points / POINTS_PER_REWARD)
  const newCardCount = eligible - claimed
  if (newCardCount <= 0) {
    return { newCards: 0, totalPoints: points, claimed }
  }
  const { season } = await getGameDayAndSeason()
  for (let i = 0; i < newCardCount; i++) {
    const threshold = (claimed + i + 1) * POINTS_PER_REWARD
    await query(
      'INSERT IGNORE INTO world_cup_reward_claim (user_id, points_threshold) VALUES (?, ?)',
      [userId, threshold]
    )
    const action = rollWorldCupReward()
    // Skip a card the team already holds the max of — it could never be
    // claimed and would hang on `pending` on the dashboard.
    if (await canReceiveActionCard(teamId, action)) {
      await query(
        'INSERT INTO action_card SET ?',
        { team_id: teamId, action, played: 0, state: 'pending', season }
      )
    }
  }
  return { newCards: newCardCount, totalPoints: points, claimed: claimed + newCardCount }
}

/**
 * Top 10 users on the leaderboard plus the requesting user's own row (even if
 * outside the top 10). Returned rows include username and the requesting user's
 * highlight flag.
 *
 * @param {number} userId
 * @returns {Promise<{ top: Array<{userId: number, username: string, points: number, isMe: boolean, rank: number}>, me: ({rank: number, points: number}|null) }>}
 */
export async function getLeaderboard (userId) {
  const rows = await query(`
    SELECT b.user_id, u.username, COUNT(*) AS points
    FROM world_cup_bet b
    JOIN world_cup_game g ON g.id = b.game_id
    JOIN user u ON u.id = b.user_id
    WHERE g.goals_team_1 IS NOT NULL
      AND g.goals_team_2 IS NOT NULL
      AND (
        (b.prediction = 'team_1' AND g.goals_team_1 > g.goals_team_2) OR
        (b.prediction = 'team_2' AND g.goals_team_2 > g.goals_team_1) OR
        (b.prediction = 'draw'   AND g.goals_team_1 = g.goals_team_2)
      )
    GROUP BY b.user_id, u.username
    ORDER BY points DESC, u.username ASC
  `)
  const ranked = rows.map((r, i) => ({
    userId: Number(r.user_id),
    username: r.username,
    points: Number(r.points),
    isMe: Number(r.user_id) === Number(userId),
    rank: i + 1
  }))
  const top = ranked.slice(0, 10)
  const meInTop = top.find(r => r.isMe)
  let me = null
  if (meInTop) {
    me = { rank: meInTop.rank, points: meInTop.points }
  } else {
    const myRow = ranked.find(r => r.isMe)
    if (myRow) me = { rank: myRow.rank, points: myRow.points }
  }
  return { top, me }
}

/**
 * Award one STAR_PLAYER action card to each of the top three users by points
 * once the WM is concluded.
 *
 * @returns {Promise<{ recipients: Array<{userId: number, teamId: number, rank: number}> }>}
 */
export async function awardStarPlayersToTopThree () {
  const top = await query(`
    SELECT b.user_id, COUNT(*) AS points, t.id AS team_id
    FROM world_cup_bet b
    JOIN world_cup_game g ON g.id = b.game_id
    JOIN team t ON t.user_id = b.user_id
    WHERE g.goals_team_1 IS NOT NULL
      AND g.goals_team_2 IS NOT NULL
      AND t.is_system_team = 0
      AND (
        (b.prediction = 'team_1' AND g.goals_team_1 > g.goals_team_2) OR
        (b.prediction = 'team_2' AND g.goals_team_2 > g.goals_team_1) OR
        (b.prediction = 'draw'   AND g.goals_team_1 = g.goals_team_2)
      )
    GROUP BY b.user_id, t.id
    ORDER BY points DESC, b.user_id ASC
    LIMIT 3
  `)
  const { season } = await getGameDayAndSeason()
  const recipients = []
  for (let i = 0; i < top.length; i++) {
    const row = top[i]
    if (await canReceiveActionCard(row.team_id, 'STAR_PLAYER')) {
      await query(
        'INSERT INTO action_card SET ?',
        { team_id: row.team_id, action: 'STAR_PLAYER', played: 0, state: 'pending', season }
      )
    }
    recipients.push({ userId: Number(row.user_id), teamId: Number(row.team_id), rank: i + 1 })
  }
  return { recipients }
}
