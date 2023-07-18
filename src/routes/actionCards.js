import { Position } from '../../client/lib/formation.js'
import { Player } from '../entities/player.js'
import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { playerNames } from '../lib/name-library.js'
import { randomItem } from '../lib/util.js'

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
    if (req.body.actionCard.action === 'CHANGE_PLAYER_POSITION') {
      await query('UPDATE player SET position=? WHERE id=?', [req.body.position, req.body.player.id])
      await query('UPDATE action_card SET played=1 WHERE id=?', [req.body.actionCard.id])
      return { success: true }
    }
    if (req.body.actionCard.action === 'NEW_YOUTH_PLYER') {
      const [game] = await query('SELECT * FROM game g ORDER BY g.season DESC LIMIT 1')
      const [team] = await query('SELECT * FROM team WHERE user_id=?', [req.user.id])
      const season = game?.season ?? 0
      const age = Math.floor(Math.random() * 3) // 16 is the default birth carrier start bla year...
      const carrierLength = 20 + Math.floor(Math.random() * 4)
      const player = new Player({
        team_id: team.id,
        name: `${randomItem(playerNames).firstName} ${randomItem(playerNames).lastName}`,
        carrier_start_season: season - age,
        carrier_end_season: season - age + carrierLength,
        level: Math.floor(Math.random() * 3) + 1,
        in_game_position: '',
        position: randomItem(Object.values(Position))
      })
      await query('INSERT INTO player SET ?', player)
      await query('UPDATE action_card SET played=1 WHERE id=?', [req.body.actionCard.id])
      return { success: true }
    }
    throw new BadRequestError('Unknown action...')
  }

}
