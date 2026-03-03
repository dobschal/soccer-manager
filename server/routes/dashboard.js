import { getTeam } from '../helper/teamHelper.js'
import { getIncomingBuyOffers } from '../helper/tradeHelper.js'
import { getSponsor } from '../helper/sponsorHelper.js'
import { getYouthPlayersByTeam } from '../helper/youthPlayerHelper.js'
import { query } from '../lib/database.js'

export default {
  async getDashboardUrgencies (platformOrReq, maybeReq) {
    let platform, req
    if (typeof platformOrReq === 'string') { platform = platformOrReq; req = maybeReq } else { platform = 'web'; req = platformOrReq }
    const col = platform === 'ios' ? 'last_login_ios' : platform === 'android' ? 'last_login_android' : 'last_login_web'
    // Update last login timestamp (fire-and-forget)
    query(`UPDATE user SET last_login = NOW(), ${col} = NOW() WHERE id = ?`, [req.user.id])

    const team = await getTeam(req)
    const urgencies = []

    // 1. Lineup completeness - need 11 players with in_game_position set
    const players = await query('SELECT * FROM player WHERE team_id=?', [team.id])
    const lineupPlayers = players.filter(p => p.in_game_position && p.in_game_position !== '')
    if (lineupPlayers.length < 11) {
      urgencies.push({ type: 'INCOMPLETE_LINEUP', count: lineupPlayers.length })
    }

    // 2. Low freshness in lineup
    const tiredPlayers = lineupPlayers.filter(p => p.freshness < 0.5)
    if (tiredPlayers.length > 0) {
      urgencies.push({ type: 'LOW_FRESHNESS', count: tiredPlayers.length })
    }

    // 3. Youth players with low moral or fitness
    const youthPlayers = await getYouthPlayersByTeam(team.id)
    const lowYouth = youthPlayers.filter(p => p.moral < 0.5 || p.fitness < 0.5)
    if (lowYouth.length > 0) {
      urgencies.push({ type: 'YOUTH_LOW_STATS', count: lowYouth.length })
    }

    // 4. Open incoming buy offers
    const incomingOffers = await getIncomingBuyOffers(team.id)
    if (incomingOffers.length > 0) {
      urgencies.push({ type: 'INCOMING_OFFERS', count: incomingOffers.length })
    }

    // 5. No active sponsor
    const { sponsor } = await getSponsor(team)
    if (!sponsor) {
      urgencies.push({ type: 'NO_SPONSOR' })
    }

    return { urgencies }
  }
}
