import { Position } from '../../client/lib/formation.js'
import { Player } from '../entities/player.js'
import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { playerNames } from '../lib/name-library.js'
import { randomItem } from '../lib/util.js'
import { getTeam } from '../helper/teamhelper.js'
import { ActionCard } from '../entities/actionCard.js'

export default {

  async getActionCards (req) {
    if (!req.user) throw new UnauthorizedError('Missing user')
    const team = await getTeam(req)
    const actionCards = await query('SELECT * FROM action_card WHERE team_id=? AND played=0', [team.id])
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
    if (req.body.actionCard.action === 'LEVEL_UP_PLAYER_9') {
      const [player] = await query('SELECT * FROM player WHERE id=?', [req.body.player.id])
      if (player.level >= 10) throw new BadRequestError('Max level reached')
      player.level += 1
      await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
      await query('UPDATE action_card SET played=1 WHERE id=?', [req.body.actionCard.id])
      return { success: true }
    }
    if (req.body.actionCard.action === 'LEVEL_UP_PLAYER_7') {
      const [player] = await query('SELECT * FROM player WHERE id=?', [req.body.player.id])
      if (player.level >= 7) throw new BadRequestError('Max level reached')
      player.level += 1
      await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
      await query('UPDATE action_card SET played=1 WHERE id=?', [req.body.actionCard.id])
      return { success: true }
    }
    if (req.body.actionCard.action === 'LEVEL_UP_PLAYER_4') {
      const [player] = await query('SELECT * FROM player WHERE id=?', [req.body.player.id])
      if (player.level >= 4) throw new BadRequestError('Max level reached')
      player.level += 1
      await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
      await query('UPDATE action_card SET played=1 WHERE id=?', [req.body.actionCard.id])
      return { success: true }
    }
    if (req.body.actionCard.action === 'CHANGE_PLAYER_POSITION') {
      await query('UPDATE player SET position=? WHERE id=?', [req.body.position, req.body.player.id])
      await query('UPDATE action_card SET played=1 WHERE id=?', [req.body.actionCard.id])
      return { success: true }
    }
    if (req.body.actionCard.action === 'NEW_YOUTH_PLAYER') {
      const [game] = await query('SELECT * FROM game g ORDER BY g.season DESC LIMIT 1')
      const team = await getTeam(req)
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
