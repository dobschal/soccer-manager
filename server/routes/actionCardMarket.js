import { UnauthorizedError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { t } from '../i18n/index.js'
import {
  createOffer,
  cancelOffer,
  placeBid,
  acceptBid,
  rejectBid,
  cancelBid,
  getMarket
} from '../helper/actionCardMarketHelper.js'

export default {

  /**
   * @param {Request} req
   * @returns {Promise<{success: boolean, offers: Array, myOffers: Array, myBids: Array, myCards: Array}>}
   */
  async getActionCardMarket (req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    const market = await getMarket(team)
    return { success: true, ...market }
  },

  /**
   * @param {number} actionCardId
   * @param {string} comment
   * @param {Request} req
   */
  async createActionCardOffer (actionCardId, comment, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    return await createOffer(actionCardId, comment, team, locale)
  },

  /**
   * @param {number} offerId
   * @param {Request} req
   */
  async cancelActionCardOffer (offerId, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    return await cancelOffer(offerId, team, locale)
  },

  /**
   * @param {number} offerId
   * @param {number} money
   * @param {number[]} cardIds
   * @param {Request} req
   */
  async bidOnActionCardOffer (offerId, money, cardIds, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    return await placeBid(offerId, money, cardIds, team, locale)
  },

  /**
   * @param {number} bidId
   * @param {Request} req
   */
  async acceptActionCardBid (bidId, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    const { gameDay, season } = await getGameDayAndSeason()
    return await acceptBid(bidId, team, gameDay, season, locale)
  },

  /**
   * @param {number} bidId
   * @param {Request} req
   */
  async rejectActionCardBid (bidId, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    return await rejectBid(bidId, team, locale)
  },

  /**
   * @param {number} bidId
   * @param {Request} req
   */
  async cancelActionCardBid (bidId, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    return await cancelBid(bidId, team, locale)
  }

}
