import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { ActionCard } from '../entities/actionCard.js'
import { getActionCards, playActionCard, getPendingActionCards, claimActionCard, generateYouthPlayerOptions, YOUTH_PLAYER_CARD_RANGES } from '../helper/actionCardHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { t } from '../i18n/index.js'

export default {

  /**
   * @param {Request} req
   * @returns {Promise<{success: boolean, actionCards: Array}>}
   */
  async getActionCards (req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    const actionCards = await getActionCards(team)
    return { success: true, actionCards }
  },

  /**
   * @param {Request} req
   * @returns {Promise<{success: boolean, pendingCards: Array}>}
   */
  async getPendingActionCards (req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    const pendingCards = await getPendingActionCards(team)
    return { success: true, pendingCards }
  },

  /**
   * @param {number} cardId
   * @param {Request} req
   * @returns {Promise<{success: boolean, card: Object}>}
   */
  async claimActionCard (cardId, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    const card = await claimActionCard(cardId, team.id)
    return { success: true, card }
  },

  /**
   * @param {Object} actionCard1
   * @param {Object} actionCard2
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async mergeCards (actionCard1, actionCard2, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    if (actionCard2.action !== actionCard1.action) throw new BadRequestError(t('error.cannotMergeCards', {}, locale))
    if (actionCard2.action === 'LEVEL_UP_PLAYER_40' || actionCard2.action === 'LEVEL_UP_PLAYER_70') {
      const { season } = await getGameDayAndSeason()
      await query('DELETE FROM action_card WHERE id=?', [actionCard1.id])
      await query('DELETE FROM action_card WHERE id=?', [actionCard2.id])
      const actionCard = new ActionCard({
        team_id: team.id,
        action: actionCard1.action === 'LEVEL_UP_PLAYER_40' ? 'LEVEL_UP_PLAYER_70' : 'LEVEL_UP_PLAYER_100',
        played: 0,
        state: 'received',
        season
      })
      const result = await query('INSERT INTO action_card SET ?', actionCard)
      return { success: true, actionCard: { id: result.insertId, action: actionCard.action } }
    }
    throw new BadRequestError(t('error.cannotMergeCards', {}, locale))
  },

  /**
   * Generate 3 youth player options for a NEW_YOUTH_PLAYER_X card so the user can pick one.
   * @param {number} cardId
   * @param {Request} req
   * @returns {Promise<{success: boolean, options: Array}>}
   */
  async getYouthPlayerOptions (cardId, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    const [card] = await query("SELECT * FROM action_card WHERE id=? AND team_id=? AND played=0 AND state='received'", [cardId, team.id])
    if (!card) throw new BadRequestError(t('error.cardNotFound', {}, locale))
    if (!(card.action in YOUTH_PLAYER_CARD_RANGES)) {
      throw new BadRequestError(t('error.invalidCardAction', {}, locale))
    }
    if (card.youth_options) {
      try {
        const cached = JSON.parse(card.youth_options)
        if (Array.isArray(cached) && cached.length > 0) {
          return { success: true, options: cached }
        }
      } catch {
        // fall through and regenerate on parse error
      }
    }
    const options = await generateYouthPlayerOptions(card.action)
    await query('UPDATE action_card SET youth_options=? WHERE id=?', [JSON.stringify(options), card.id])
    return { success: true, options }
  },

  /**
   * @param {Object} actionCard
   * @param {PlayerType} player
   * @param {string} position
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async useActionCard (actionCard, player, position, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const team = await getTeam(req)
    const actionCards = await query("SELECT * FROM action_card WHERE id=? AND team_id=? AND played=0 AND state='received'", [actionCard.id, team.id])
    if (actionCards.length !== 1) throw new BadRequestError(t('error.cardNotFound', {}, locale))
    await playActionCard({ actionCard, player, position }, team, locale)
    return { success: true }
  }

}
