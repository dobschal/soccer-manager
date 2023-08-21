import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { ActionCard } from '../entities/actionCard.js'
import { getActionCards, playActionCard } from '../helper/actionCardHelper.js'

export default {

  async getActionCards (req) {
    if (!req.user) throw new UnauthorizedError('Missing user')
    const team = await getTeam(req)
    const actionCards = await getActionCards(team)
    return { success: true, actionCards }
  },

  async mergeCards (req) {
    if (!req.user) throw new UnauthorizedError('Missing user')
    const team = await getTeam(req)
    /** @type {ActionCardType} */
    const actionCard1 = req.body.actionCard1
    /** @type {ActionCardType} */
    const actionCard2 = req.body.actionCard2
    if (actionCard2.action !== actionCard1.action) throw new BadRequestError('You can only merge cards of the same type')
    if (actionCard2.action === 'LEVEL_UP_PLAYER_4' || actionCard2.action === 'LEVEL_UP_PLAYER_7') {
      await query('DELETE FROM action_card WHERE id=?', [actionCard1.id])
      await query('DELETE FROM action_card WHERE id=?', [actionCard2.id])
      const actionCard = new ActionCard({
        team_id: team.id,
        action: actionCard1.action === 'LEVEL_UP_PLAYER_4' ? 'LEVEL_UP_PLAYER_7' : 'LEVEL_UP_PLAYER_9',
        played: 0
      })
      await query('INSERT INTO action_card SET ?', actionCard)
      return { success: true }
    }
    throw new BadRequestError('Cannot merge')
  },

  async useActionCard (req) {
    if (!req.user) throw new UnauthorizedError('Missing user')
    const team = await getTeam(req)
    const actionCards = await query('SELECT * FROM action_card WHERE id=? AND team_id=? AND played=0', [req.body.actionCard.id, team.id])
    if (actionCards.length !== 1) throw new BadRequestError('Action card does not exist')
    await playActionCard(req.body, team)
    return { success: true }
  }

}
