import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { ActionCard } from '../entities/actionCard.js'
import { getActionCards, playActionCard } from '../helper/actionCardHelper.js'
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
    if (actionCard2.action === 'LEVEL_UP_PLAYER_4' || actionCard2.action === 'LEVEL_UP_PLAYER_7') {
      await query('DELETE FROM action_card WHERE id=?', [actionCard1.id])
      await query('DELETE FROM action_card WHERE id=?', [actionCard2.id])
      const actionCard = new ActionCard({
        team_id: team.id,
        action: actionCard1.action === 'LEVEL_UP_PLAYER_4' ? 'LEVEL_UP_PLAYER_7' : 'LEVEL_UP_PLAYER_10',
        played: 0
      })
      await query('INSERT INTO action_card SET ?', actionCard)
      return { success: true }
    }
    throw new BadRequestError(t('error.cannotMergeCards', {}, locale))
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
    const actionCards = await query('SELECT * FROM action_card WHERE id=? AND team_id=? AND played=0', [actionCard.id, team.id])
    if (actionCards.length !== 1) throw new BadRequestError(t('error.cardNotFound', {}, locale))
    await playActionCard({ actionCard, player, position }, team, locale)
    return { success: true }
  }

}
