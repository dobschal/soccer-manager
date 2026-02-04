import { transaction } from '../lib/database.js'
import { FinanceLog } from '../entities/financeLog.js'

/**
 * Updates team balance atomically and creates a finance log entry.
 * Uses a transaction to ensure both operations succeed or fail together.
 *
 * @param {TeamType} team
 * @param {number} diff
 * @param {string} reason
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function updateTeamBalance (team, diff, reason, gameDay, season) {
  // Guard against NaN - log error and use 0 to prevent SQL errors
  if (isNaN(diff) || diff === null || diff === undefined) {
    console.error(`[FINANCE ERROR] NaN/invalid diff detected for team ${team?.id} (${team?.name}), reason: "${reason}". Using 0 instead.`)
    diff = 0
  }

  await transaction(async (query) => {
    // Use atomic update to prevent race conditions
    await query('UPDATE team SET balance = balance + ? WHERE id = ?', [diff, team.id])

    // Get the new balance after atomic update
    const [updatedTeam] = await query('SELECT balance FROM team WHERE id = ?', [team.id])
    const newBalance = updatedTeam.balance

    // Update the local team object to reflect the new balance
    team.balance = newBalance

    // Create finance log entry
    await query('INSERT INTO finance_log SET ?', new FinanceLog({
      team_id: team.id,
      value: diff,
      balance: newBalance,
      game_day: gameDay,
      season,
      reason
    }))
  })
}
