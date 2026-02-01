import { Sponsor } from '../entities/sponsor.js'
import { getSponsor, getSponsorOffers } from '../helper/sponsorHelper.js'
import { query } from '../lib/database.js'
import { getTeam } from '../helper/teamHelper.js'
import { sponsorNames } from '../lib/name-library.js'

export default {

  /**
   * @returns {{sponsorNames: string[]}}
   */
  getSponsorNames () {
    return { sponsorNames }
  },

  /**
   * @param {Request} req
   * @returns {Promise<{sponsor: Sponsor|null}>}
   */
  async getSponsor (req) {
    return await getSponsor(await getTeam(req))
  },

  /**
   * @param {Request} req
   * @returns {Promise<{sponsors: Array}>}
   */
  async getSponsorOffers (req) {
    const team = await getTeam(req)
    const sponsors = await getSponsorOffers(team)
    return { sponsors }
  },

  /**
   * @param {Object} sponsor
   * @param {Request} req
   * @returns {Promise<boolean>}
   */
  async chooseSponsor (sponsor, req) {
    const team = await getTeam(req)
    const sponsorEntity = new Sponsor({ ...sponsor, team_id: team.id })
    await query('INSERT INTO sponsor SET ?', sponsorEntity)
    return true
  }
}
