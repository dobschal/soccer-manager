import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { Player } from '../entities/player.js'
import { randomItem } from '../lib/util.js'
import { Position } from '../../client/util/formation.js'
import { addLogMessage } from './logMessageHelper.js'
import { generateRandomPlayerName } from '../prepare-season.js'
import { addPlayerHistory } from './playerHistoryHelper.js'
import { getPlayerById } from './playerHelper.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { updateTeamBalance } from './financeHelper.js'

// Probabilities per game day (34 game days per season)
// Note: 2x LEVEL_UP_4 can merge into 1x LEVEL_UP_7, and 2x LEVEL_UP_7 into 1x LEVEL_UP_10
//
// - FRESHNESS_10: ~30/season → 0.88/day
// - LEVEL_UP_PLAYER_4: ~4/season → 0.12/day (can merge into ~2 LEVEL_UP_7)
// - CHANGE_PLAYER_POSITION: ~4/season → 0.12/day
// - BONUS_100K: ~2/season → 0.06/day
// - NEW_YOUTH_PLAYER: ~1/season → 0.03/day
// - LEVEL_UP_PLAYER_7: ~1/season → 0.03/day (+ ~2 from merge = ~3 effective, medium amount reach level 7)
// - LEVEL_UP_PLAYER_10: ~0.2/season → 0.006/day (+ ~1.5 from merge = ~1.7 effective, rare to reach level 10)
export const actionCardChances = {
  FRESHNESS_10: 0.88,
  LEVEL_UP_PLAYER_4: 0.12,
  CHANGE_PLAYER_POSITION: 0.12,
  BONUS_100K: 0.06,
  NEW_YOUTH_PLAYER: 0.03,
  LEVEL_UP_PLAYER_7: 0.03,
  LEVEL_UP_PLAYER_10: 0.006
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
export async function playActionCard ({
  player: p,
  position,
  actionCard
}, team) {
  if (actionCard.action === 'FRESHNESS_10') {
    const player = await getPlayerById(p.id)
    player.freshness = Math.min(1.0, player.freshness + 0.1)
    await query('UPDATE player SET freshness=? WHERE id=?', [player.freshness, player.id])
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    return { success: true }
  }
  if (actionCard.action === 'LEVEL_UP_PLAYER_10') {
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
    await addLogMessage(`You gave ${player.name} a level up.`, team, null, null, 'level-up')
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
    await addLogMessage(`You gave ${player.name} a level up.`, team, null, null, 'level-up')
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
    await addLogMessage(`You gave ${player.name} a level up.`, team, null, null, 'level-up')
    await addPlayerHistory(player.id, 'LEVEL_UP', player.level)
    return { success: true }
  }
  if (actionCard.action === 'CHANGE_PLAYER_POSITION') {
    const [player] = await query('SELECT * FROM player WHERE id=?', [p.id])
    if (player.position === 'GK') {
      throw new BadRequestError('Goalkeepers cannot change their position.')
    }
    if (position === 'GK') {
      throw new BadRequestError('Players cannot become goalkeepers.')
    }
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
    await addLogMessage(`You got a new young talent ${player.name}.`, team, null, null, 'child')
    return { success: true }
  }
  if (actionCard.action === 'BONUS_100K') {
    const {
      gameDay,
      season
    } = await getGameDayAndSeason()
    await updateTeamBalance(team, 100000, 'Action Card: Bonus Money', gameDay, season)
    await query('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    await addLogMessage('You received a bonus of 100,000€!', team, null, null, 'money')
    return { success: true }
  }
  throw new BadRequestError('Unknown action...')
}

/**
 * Merge two action cards of the same type into a better one
 * @param {ActionCardType} actionCard1
 * @param {ActionCardType} actionCard2
 * @param {TeamType} team
 * @returns {Promise<{success: boolean, newCardType: string}>}
 */
export async function mergeActionCards (actionCard1, actionCard2, team) {
  if (actionCard2.action !== actionCard1.action) {
    throw new BadRequestError('You can only merge cards of the same type')
  }
  if (actionCard1.action !== 'LEVEL_UP_PLAYER_4' && actionCard1.action !== 'LEVEL_UP_PLAYER_7') {
    throw new BadRequestError('Cannot merge this card type')
  }
  const newCardType = actionCard1.action === 'LEVEL_UP_PLAYER_4' ? 'LEVEL_UP_PLAYER_7' : 'LEVEL_UP_PLAYER_10'
  await query('DELETE FROM action_card WHERE id=?', [actionCard1.id])
  await query('DELETE FROM action_card WHERE id=?', [actionCard2.id])
  await query('INSERT INTO action_card SET ?', {
    team_id: team.id,
    action: newCardType,
    played: 0
  })
  return { success: true, newCardType }
}
