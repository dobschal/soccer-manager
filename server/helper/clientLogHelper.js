import { query } from '../lib/database.js'

/**
 * Delete client logs older than 7 days.
 * @returns {Promise<{ deleted: number }>}
 */
export async function cleanupOldClientLogs () {
  const result = await query('DELETE FROM client_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)')
  const deleted = result.affectedRows || 0
  if (deleted > 0) {
    console.log(`🧹 Cleaned up ${deleted} old client logs`)
  }
  return { deleted }
}
