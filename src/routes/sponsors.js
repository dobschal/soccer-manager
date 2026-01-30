import { Sponsor } from '../entities/sponsor.js'
import { getSponsor, getSponsorOffers } from '../helper/sponsorHelper.js'
import { query } from '../lib/database.js'
import { getTeam } from '../helper/teamHelper.js'

export default {

  async getSponsor (req) {
    return await getSponsor(await getTeam(req))
  },

  async getSponsorOffers (req) {
    const team = await getTeam(req)
    const sponsors = await getSponsorOffers(team)
    return { sponsors }
  },

  async chooseSponsor (sponsor, req) {
    const team = await getTeam(req)
    const sponsorEntity = new Sponsor({ ...sponsor, team_id: team.id })
    await query('INSERT INTO sponsor SET ?', sponsorEntity)
    return true
  }
}
