import { query } from '../lib/database.js'

export default {
  async getFinanceLog (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const log = await query('SELECT * FROM finance_log WHERE team_id=?', [team.id])
    return { log }
  }
}
