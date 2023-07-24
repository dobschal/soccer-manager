import { Sponsor } from '../entities/sponsor.js'
import { getSponsor, getSponsorOffers } from '../helper/sponsorHelper.js'
import { query } from '../lib/database.js'
import { getTeam } from '../helper/teamhelper.js'

export default {

  async getSponsor (req) {
    return await getSponsor(await getTeam(req))
  },

  async getSponsorOffers (req) {
    const team = await getTeam(req)
    const sponsors = await getSponsorOffers(team)
    return { sponsors }
  },

  async chooseSponsor (req) {
    //
    // TODO: Secure that route
    //
    const sponsor = new Sponsor(req.body.sponsor)
    await query('INSERT INTO sponsor SET ?', sponsor)
    return true
  }
}
