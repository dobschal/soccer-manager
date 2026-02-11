import { Sponsor } from '../entities/sponsor.js'
import { getSponsor, getSponsorOffers } from '../helper/sponsorHelper.js'
import { query } from '../lib/database.js'
import { getTeam } from '../helper/teamHelper.js'
import { sponsorNames } from '../lib/name-library.js'

// Cache for sponsor offers: Map<teamId, { offers: Sponsor[], timestamp: number }>
const sponsorOffersCache = new Map()
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Get cached sponsor offers or generate new ones
 * @param {TeamType} team
 * @returns {Promise<Sponsor[]>}
 */
async function getCachedSponsorOffers (team) {
  const cached = sponsorOffersCache.get(team.id)
  const now = Date.now()

  if (cached && (now - cached.timestamp) < CACHE_DURATION_MS) {
    return cached.offers
  }

  // Generate new offers and cache them
  const offers = await getSponsorOffers(team)
  sponsorOffersCache.set(team.id, { offers, timestamp: now })
  return offers
}

/**
 * Clear cached sponsor offers for a team
 * @param {number} teamId
 */
export function clearSponsorOffersCache (teamId) {
  sponsorOffersCache.delete(teamId)
}

/**
 * Clear all cached sponsor offers (for testing)
 */
export function clearAllSponsorOffersCache () {
  sponsorOffersCache.clear()
}

export default {

  /**
   * @returns {{sponsorNames: string[]}}
   */
  getSponsorNames () {
    return { sponsorNames }
  },

  /**
   * @param {Request} req
   * @returns {Promise<{sponsor: (SponsorType&{remaining_days?: number})}>}
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
    const sponsors = await getCachedSponsorOffers(team)
    return { sponsors }
  },

  /**
   * @param {Object} sponsor
   * @param {Request} req
   * @returns {Promise<boolean>}
   */
  async chooseSponsor (sponsor, req) {
    const team = await getTeam(req)
    const sponsorEntity = new Sponsor({
      ...sponsor,
      team_id: team.id
    })
    await query('INSERT INTO sponsor SET ?', sponsorEntity)
    // Clear the cache so new offers are generated when current contract expires
    clearSponsorOffersCache(team.id)
    return true
  }
}
