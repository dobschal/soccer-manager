import { getTeam } from '../helper/teamhelper.js'
import { query } from '../lib/database.js'

export default {
  async getNews (req) {
    const team = await getTeam(req)
    const news = await query('SELECT * FROM news WHERE team_id=?', [team.id])
    return { news }
  }
}
