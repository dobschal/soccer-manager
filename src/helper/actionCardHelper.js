import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { Player } from '../entities/player.js'
import { randomItem } from '../lib/util.js'
import { Position } from '../../client/util/formation.js'
import { addLogMessage } from './newsHelper.js'
import { generateRandomPlayerName } from '../prepare-season.js'
import { addPlayerHistory } from './playerHistoryHelper.js'
import { getPlayerById } from './playerHelper.js'
import { getGameDayAndSeason } from './gameDayHelper.js'

export const actionCardChances = {
  LEVEL_UP_PLAYER_9: 0.05, // TODO: LEVEL_UP_PLAYER_9, is actually level up 10 ...
  LEVEL_UP_PLAYER_7: 0.2,
  LEVEL_UP_PLAYER_4: 0.4,
  CHANGE_PLAYER_POSITION: 0.05,
  NEW_YOUTH_PLAYER: 0.1,
  FRESHNESS_10: 0.4
}

/**
 * @param {TeamType} team
 * @returns {Promise<ActionCardType[]>}
 */
export async function getActionCards (team) {
  return await query('SELECT * FROM action_card WHERE team_id=? AND played=0', [team.id])
}

/**
 * @param {PlayerType} player
 * @returns {Promise<number>}
 */
async function levelUpsCurrentSeason (player) {
  const { season } = await getGameDayAndSeason()
  const levelUps = await query(
    'SELECT * FROM player_history WHERE player_id=? AND season=? AND `type`=\'LEVEL_UP\'',
    [player.id, season]
  )
  return levelUps.length
}

/**
 * @param {PlayerType} p
 * @param {string} position
 * @param {ActionCardType} actionCard
 * @param {TeamType} team
 * @returns {Promise<{success: boolean}>}
 */
export async function playActionCard ({ player: p, position, actionCard }, team) {
  if (actionCard.action === 'FRESHNESS_10') {
    const player = await getPlayerById(p.id)
    player.freshness = Math.min(1.0, player.freshness + 0.1)
    await query('UPDATE player SET freshness=? WHERE id=?', [player.freshness, player.id])
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    return { success: true }
  }
  if (actionCard.action === 'LEVEL_UP_PLAYER_9') {
    const [player] = await query('SELECT * FROM player WHERE id=?', [p.id])
    if (await levelUpsCurrentSeason(player) >= 2) {
      throw new BadRequestError('Player already got 2 level ups this season...')
    }
    if (player.level >= 10) {
      throw new BadRequestError('Player already reached the maximum level')
    }
    player.level += 1
    await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    await addLogMessage(`You gave ${player.name} a level up.`, team)
    await addPlayerHistory(player.id, 'LEVEL_UP', player.level)
    return { success: true }
  }
  if (actionCard.action === 'LEVEL_UP_PLAYER_7') {
    const [player] = await query('SELECT * FROM player WHERE id=?', [p.id])
    if (await levelUpsCurrentSeason(player) >= 2) {
      throw new BadRequestError('Player already got 2 level ups this season...')
    }
    if (player.level >= 7) {
      throw new BadRequestError('Action card only allows level ups until level 7.')
    }
    player.level += 1
    await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    await addLogMessage(`You gave ${player.name} a level up.`, team)
    await addPlayerHistory(player.id, 'LEVEL_UP', player.level)
    return { success: true }
  }
  if (actionCard.action === 'LEVEL_UP_PLAYER_4') {
    const [player] = await query('SELECT * FROM player WHERE id=?', [p.id])
    if (await levelUpsCurrentSeason(player) >= 2) {
      throw new BadRequestError('Player already got 2 level ups this season...')
    }
    if (player.level >= 4) {
      throw new BadRequestError('Action card only allows level ups until level 4.')
    }
    player.level += 1
    await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    await addLogMessage(`You gave ${player.name} a level up.`, team)
    await addPlayerHistory(player.id, 'LEVEL_UP', player.level)
    return { success: true }
  }
  if (actionCard.action === 'CHANGE_PLAYER_POSITION') {
    await query('UPDATE player SET position=? WHERE id=?', [position, p.id])
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    await addPlayerHistory(p.id, 'CHANGE_PLAYER_POSITION', position)
    return { success: true }
  }
  if (actionCard.action === 'NEW_YOUTH_PLAYER') {
    const [game] = await query('SELECT * FROM game g ORDER BY g.season DESC LIMIT 1')
    const season = game?.season ?? 0
    const age = Math.floor(Math.random() * 3) // 16 is the default birth carrier start bla year...
    const carrierLength = 20 + Math.floor(Math.random() * 4)
    const player = new Player({
      hair_color: Math.floor(Math.random() * 7),
      skin_color: Math.floor(Math.random() * 3),
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
    await addLogMessage(`You got a new young talent ${player.name}.`, team)
    return { success: true }
  }
  throw new BadRequestError('Unknown action...')
}
