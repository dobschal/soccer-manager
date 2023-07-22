import { query } from '../lib/database.js'
import { FinanceLog } from '../entities/financeLog.js'

/**
 * @param {TeamType} team
 * @param {number} diff
 * @param {string} reason
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function updateTeamBalance (team, diff, reason, gameDay, season) {
  team.balance += diff
  await query('UPDATE team SET balance=? WHERE id=?', [team.balance, team.id])
  await query('INSERT INTO finance_log SET ?', new FinanceLog({
    team_id: team.id,
    value: diff,
    balance: team.balance,
    game_day: gameDay,
    season,
    reason
  }))
}
