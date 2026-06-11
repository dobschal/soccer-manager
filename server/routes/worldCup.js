import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { t } from '../i18n/index.js'
import {
  awardStarPlayersToTopThree,
  awardWorldCupRewards,
  getLeaderboard,
  getUserPoints,
  isValidPrediction,
  outcomeFor,
  POINTS_PER_REWARD
} from '../helper/worldCupHelper.js'
import { WORLD_CUP_NATIONS, nationNameByCode } from '../helper/worldCupSeedData.js'

const PAGE_SIZE = 6

/**
 * Format a raw DB row from `world_cup_game` for client consumption. The bet,
 * when present, is the requesting user's own prediction.
 *
 * @param {any} row
 * @param {{prediction: string|null}|null} bet
 * @returns {object}
 */
function shapeGame (row, bet) {
  const kickoffMs = new Date(row.kickoff).getTime()
  const outcome = outcomeFor(row.goals_team_1, row.goals_team_2)
  return {
    id: Number(row.id),
    team1Code: row.team_1_code,
    team1Name: row.team_1_name,
    team2Code: row.team_2_code,
    team2Name: row.team_2_name,
    kickoff: row.kickoff,
    kickoffMs,
    goalsTeam1: row.goals_team_1 === null ? null : Number(row.goals_team_1),
    goalsTeam2: row.goals_team_2 === null ? null : Number(row.goals_team_2),
    stage: row.stage,
    outcome,
    isPlayed: row.goals_team_1 !== null && row.goals_team_2 !== null,
    hasKickedOff: kickoffMs <= Date.now(),
    myPrediction: bet?.prediction ?? null,
    myBetCorrect: bet && outcome ? bet.prediction === outcome : null
  }
}

/**
 * Look up the requesting user's bets for a list of games.
 *
 * @param {number} userId
 * @param {number[]} gameIds
 * @returns {Promise<Record<number, {prediction: string}>>}
 */
async function getBetsByGameId (userId, gameIds) {
  if (gameIds.length === 0) return {}
  const placeholders = gameIds.map(() => '?').join(',')
  const rows = await query(
    `SELECT game_id, prediction FROM world_cup_bet WHERE user_id = ? AND game_id IN (${placeholders})`,
    [userId, ...gameIds]
  )
  const map = {}
  for (const r of rows) {
    map[Number(r.game_id)] = { prediction: r.prediction }
  }
  return map
}

function requireAdmin (req) {
  if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, req.locale || 'en'))
  if (!req.user.is_admin) throw new BadRequestError('Only admins can do this.')
}

function _validateGameInput ({ team1Code, team2Code, kickoff, stage }) {
  const codes = new Set(WORLD_CUP_NATIONS.map(n => n.code))
  if (!codes.has(team1Code)) throw new BadRequestError('Unknown team 1 code')
  if (!codes.has(team2Code)) throw new BadRequestError('Unknown team 2 code')
  if (team1Code === team2Code) throw new BadRequestError('Teams must differ')
  if (!kickoff || Number.isNaN(new Date(kickoff).getTime())) {
    throw new BadRequestError('Invalid kickoff time')
  }
  const allowedStages = new Set(['group', 'round_of_32', 'round_of_16', 'quarter', 'semi', 'final', 'third_place'])
  if (stage && !allowedStages.has(stage)) throw new BadRequestError('Invalid stage')
}

function _normalizeGoals (raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 99) throw new BadRequestError('Invalid goals')
  return n
}

export default {

  /**
   * Get a paginated list of upcoming/recent games (chronological), each with
   * the requesting user's bet attached.
   *
   * @param {number} offset
   * @param {number} limit
   * @param {Request} req
   * @returns {Promise<{success: boolean, games: Array, total: number, pageSize: number}>}
   */
  async getWorldCupGames (offset, limit, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const safeOffset = Math.max(0, Number(offset) || 0)
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || PAGE_SIZE))
    const [totalRow] = await query('SELECT COUNT(*) AS total FROM world_cup_game')
    const rows = await query(
      'SELECT * FROM world_cup_game ORDER BY kickoff ASC, id ASC LIMIT ? OFFSET ?',
      [safeLimit, safeOffset]
    )
    const ids = rows.map(r => Number(r.id))
    const bets = await getBetsByGameId(req.user.id, ids)
    const games = rows.map(r => shapeGame(r, bets[Number(r.id)] || null))
    return {
      success: true,
      games,
      total: Number(totalRow?.total || 0),
      pageSize: PAGE_SIZE
    }
  },

  /**
   * Return every WM game (group + knockout) for the "show all" view.
   *
   * @param {Request} req
   * @returns {Promise<{success: boolean, games: Array}>}
   */
  async getWorldCupAllGames (req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const rows = await query(
      'SELECT * FROM world_cup_game ORDER BY kickoff ASC, id ASC'
    )
    const ids = rows.map(r => Number(r.id))
    const bets = await getBetsByGameId(req.user.id, ids)
    const games = rows.map(r => shapeGame(r, bets[Number(r.id)] || null))
    return { success: true, games }
  },

  /**
   * Place or update a bet on an upcoming game. Betting is blocked once kickoff
   * has passed.
   *
   * @param {number} gameId
   * @param {string} prediction - one of 'team_1' | 'draw' | 'team_2'
   * @param {Request} req
   * @returns {Promise<{success: boolean, prediction: string}>}
   */
  async placeWorldCupBet (gameId, prediction, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    if (!isValidPrediction(prediction)) throw new BadRequestError('Invalid prediction')
    const id = Number(gameId)
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Invalid game id')
    const [game] = await query('SELECT id, kickoff FROM world_cup_game WHERE id = ?', [id])
    if (!game) throw new BadRequestError('Game not found')
    const kickoffMs = new Date(game.kickoff).getTime()
    if (kickoffMs <= Date.now()) {
      throw new BadRequestError(t('worldCup.bettingClosed', {}, locale))
    }
    await query(
      `INSERT INTO world_cup_bet (user_id, game_id, prediction)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE prediction = VALUES(prediction)`,
      [req.user.id, id, prediction]
    )
    return { success: true, prediction }
  },

  /**
   * Top 10 leaderboard plus the requesting user's own row, current points,
   * and progress toward the next action card reward.
   *
   * @param {Request} req
   * @returns {Promise<{success: boolean, top: Array, me: Object|null, myPoints: number, pointsToNextReward: number, nextRewardAt: number}>}
   */
  async getWorldCupLeaderboard (req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const { top, me } = await getLeaderboard(req.user.id)
    const myPoints = me ? me.points : await getUserPoints(req.user.id)
    const nextRewardAt = (Math.floor(myPoints / POINTS_PER_REWARD) + 1) * POINTS_PER_REWARD
    return {
      success: true,
      top,
      me,
      myPoints,
      pointsToNextReward: nextRewardAt - myPoints,
      nextRewardAt,
      pointsPerReward: POINTS_PER_REWARD
    }
  },

  /**
   * The supported list of nations for the admin selector.
   * @returns {Promise<{success: boolean, nations: Array}>}
   */
  async getWorldCupNations () {
    return { success: true, nations: WORLD_CUP_NATIONS }
  },

  /**
   * Admin – return the full list of games for management.
   * @param {Request} req
   * @returns {Promise<{success: boolean, games: Array}>}
   */
  async adminListWorldCupGames (req) {
    requireAdmin(req)
    const rows = await query('SELECT * FROM world_cup_game ORDER BY kickoff ASC, id ASC')
    return { success: true, games: rows.map(r => shapeGame(r, null)) }
  },

  /**
   * Admin – create a new game.
   *
   * @param {{team1Code: string, team2Code: string, kickoff: string, stage?: string, goalsTeam1?: number, goalsTeam2?: number}} payload
   * @param {Request} req
   * @returns {Promise<{success: boolean, id: number}>}
   */
  async adminCreateWorldCupGame (payload, req) {
    requireAdmin(req)
    const { team1Code, team2Code, kickoff, stage = 'group', goalsTeam1 = null, goalsTeam2 = null } = payload || {}
    _validateGameInput({ team1Code, team2Code, kickoff, stage })
    const goals1 = _normalizeGoals(goalsTeam1)
    const goals2 = _normalizeGoals(goalsTeam2)
    const names = nationNameByCode()
    const utcDate = new Date(kickoff)
    const kickoffMysql = utcDate.toISOString().slice(0, 19).replace('T', ' ')
    const result = await query(
      `INSERT INTO world_cup_game
       (team_1_code, team_1_name, team_2_code, team_2_name, kickoff, goals_team_1, goals_team_2, stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [team1Code, names[team1Code], team2Code, names[team2Code], kickoffMysql, goals1, goals2, stage]
    )
    return { success: true, id: result.insertId }
  },

  /**
   * Admin – update an existing game. Setting the result re-awards bettors who
   * just became correct enough to cross a 3-point threshold.
   *
   * @param {{id: number, team1Code: string, team2Code: string, kickoff: string, stage?: string, goalsTeam1?: number|null, goalsTeam2?: number|null}} payload
   * @param {Request} req
   * @returns {Promise<{success: boolean, awarded: Array<{userId: number, newCards: number}>}>}
   */
  async adminUpdateWorldCupGame (payload, req) {
    requireAdmin(req)
    const { id, team1Code, team2Code, kickoff, stage = 'group', goalsTeam1 = null, goalsTeam2 = null } = payload || {}
    const numericId = Number(id)
    if (!Number.isInteger(numericId) || numericId <= 0) throw new BadRequestError('Invalid game id')
    _validateGameInput({ team1Code, team2Code, kickoff, stage })
    const goals1 = _normalizeGoals(goalsTeam1)
    const goals2 = _normalizeGoals(goalsTeam2)
    if ((goals1 === null) !== (goals2 === null)) {
      throw new BadRequestError('Both goals must be set or both empty')
    }
    const names = nationNameByCode()
    const utcDate = new Date(kickoff)
    const kickoffMysql = utcDate.toISOString().slice(0, 19).replace('T', ' ')
    const wasFinalized = (await query('SELECT goals_team_1, goals_team_2 FROM world_cup_game WHERE id = ?', [numericId]))[0]
    if (!wasFinalized) throw new BadRequestError('Game not found')
    await query(
      `UPDATE world_cup_game SET team_1_code=?, team_1_name=?, team_2_code=?, team_2_name=?, kickoff=?, goals_team_1=?, goals_team_2=?, stage=? WHERE id=?`,
      [team1Code, names[team1Code], team2Code, names[team2Code], kickoffMysql, goals1, goals2, stage, numericId]
    )

    // If a result was just set (or changed), top up rewards for every bettor.
    const justFinalized = goals1 !== null && goals2 !== null
    const awarded = []
    if (justFinalized) {
      const bettors = await query(
        `SELECT b.user_id, t.id AS team_id
         FROM world_cup_bet b
         JOIN team t ON t.user_id = b.user_id
         WHERE b.game_id = ? AND t.is_system_team = 0`,
        [numericId]
      )
      for (const b of bettors) {
        const result = await awardWorldCupRewards(Number(b.user_id), Number(b.team_id))
        if (result.newCards > 0) {
          awarded.push({ userId: Number(b.user_id), newCards: result.newCards })
        }
      }
    }
    return { success: true, awarded }
  },

  /**
   * Admin – delete a game. Bets on the game are removed too.
   * @param {number} id
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async adminDeleteWorldCupGame (id, req) {
    requireAdmin(req)
    const numericId = Number(id)
    if (!Number.isInteger(numericId) || numericId <= 0) throw new BadRequestError('Invalid game id')
    await query('DELETE FROM world_cup_bet WHERE game_id = ?', [numericId])
    await query('DELETE FROM world_cup_game WHERE id = ?', [numericId])
    return { success: true }
  },

  /**
   * Admin – mark the WM as concluded and award STAR_PLAYER cards to the top
   * three bettors. Idempotent: only awards once.
   *
   * @param {Request} req
   * @returns {Promise<{success: boolean, recipients: Array, alreadyAwarded: boolean}>}
   */
  async adminConcludeWorldCup (req) {
    requireAdmin(req)
    const [state] = await query('SELECT is_concluded, star_players_awarded FROM world_cup_state WHERE id = 1')
    if (state?.star_players_awarded) {
      return { success: true, recipients: [], alreadyAwarded: true }
    }
    const { recipients } = await awardStarPlayersToTopThree()
    await query('UPDATE world_cup_state SET is_concluded = 1, star_players_awarded = 1 WHERE id = 1')
    return { success: true, recipients, alreadyAwarded: false }
  }

}
