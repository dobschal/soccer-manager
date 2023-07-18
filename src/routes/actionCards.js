import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'

export default {

  async getActionCards (req) {
    if (!req.user) throw new UnauthorizedError('Missing user')
    const actionCards = await query('SELECT * FROM action_card WHERE user_id=? AND played=0', [req.user.id])
    return { success: true, actionCards }
  },

  async useActionCard (req) {
    if (!req.user) throw new UnauthorizedError('Missing user')
    const actionCards = await query('SELECT * FROM action_card WHERE id=? AND user_id=? AND played=0', [req.body.actionCard.id, req.user.id])
    if (actionCards.length !== 1) throw new BadRequestError('Action card does not exist')
    if (req.body.actionCard.action === 'LEVEL_UP_PLAYER') {
      const [player] = await query('SELECT * FROM player WHERE id=?', [req.body.player.id])
      if (player.level < 10) player.level += 1
      await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
      await query('UPDATE action_card SET played=1 WHERE id=?', [req.body.actionCard.id])
      return { success: true }
    }
    //
    // TODO
    //
    return false
  }

}
