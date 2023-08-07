import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam } from './teamhelper.js'
import { Player } from '../entities/player.js'
import { randomItem } from '../lib/util.js'
import { playerNames } from '../lib/name-library.js'
import { Position } from '../../client/lib/formation.js'
import { addNews } from './newsHelper.js'
import { generateRandomPlayerName } from '../prepare-season.js'

/**
 * @param {TeamType} team
 * @returns {Promise<ActionCardType[]>}
 */
export async function getActionCards (team) {
  return await query('SELECT * FROM action_card WHERE team_id=? AND played=0', [team.id])
}

export async function playActionCard ({ player: p, position, actionCard }, team) {
  if (actionCard.action === 'LEVEL_UP_PLAYER_9') {
    const [player] = await query('SELECT * FROM player WHERE id=?', [p.id])
    if (player.level >= 10) throw new BadRequestError('Max level reached')
    player.level += 1
    await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    await addNews(`You gave ${player.name} a level up.`, team)
    return { success: true }
  }
  if (actionCard.action === 'LEVEL_UP_PLAYER_7') {
    const [player] = await query('SELECT * FROM player WHERE id=?', [p.id])
    if (player.level >= 7) throw new BadRequestError('Max level reached')
    player.level += 1
    await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    await addNews(`You gave ${player.name} a level up.`, team)
    return { success: true }
  }
  if (actionCard.action === 'LEVEL_UP_PLAYER_4') {
    const [player] = await query('SELECT * FROM player WHERE id=?', [p.id])
    if (player.level >= 4) throw new BadRequestError('Max level reached')
    player.level += 1
    await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    await addNews(`You gave ${player.name} a level up.`, team)
    return { success: true }
  }
  if (actionCard.action === 'CHANGE_PLAYER_POSITION') {
    await query('UPDATE player SET position=? WHERE id=?', [position, p.id])
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    return { success: true }
  }
  if (actionCard.action === 'NEW_YOUTH_PLAYER') {
    const [game] = await query('SELECT * FROM game g ORDER BY g.season DESC LIMIT 1')
    const season = game?.season ?? 0
    const age = Math.floor(Math.random() * 3) // 16 is the default birth carrier start bla year...
    const carrierLength = 20 + Math.floor(Math.random() * 4)
    const player = new Player({
      team_id: team.id,
      name: (await generateRandomPlayerName()),
      carrier_start_season: season - age,
      carrier_end_season: season - age + carrierLength,
      level: Math.floor(Math.random() * 3) + 1,
      in_game_position: '',
      position: randomItem(Object.values(Position)),
      freshness: 1.0
    })
    await query('INSERT INTO player SET ?', player)
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    await addNews(`You got a new young talent ${player.name}.`, team)
    return { success: true }
  }
  throw new BadRequestError('Unknown action...')
}
