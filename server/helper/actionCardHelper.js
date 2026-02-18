import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { addLogMessage } from './logMessageHelper.js'
import { addPlayerHistory } from './playerHistoryHelper.js'
import { getPlayerById } from './playerHelper.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { updateTeamBalance } from './financeHelper.js'
import { t, getUserLocale } from '../i18n/index.js'
import { createYouthPlayer } from './youthPlayerHelper.js'

// Probabilities per game day (34 game days per season)
// Note: 2x LEVEL_UP_40 can merge into 1x LEVEL_UP_70, and 2x LEVEL_UP_70 into 1x LEVEL_UP_100
// Levels are now 1-100 (was 1-10). Cards still give +1 level per use but appear 10x more often.
//
// - LEVEL_UP_PLAYER_40: ~40/season → 1.2/day (can merge into ~20 LEVEL_UP_70)
// - FRESHNESS_10: ~30/season → 0.88/day
// - CHANGE_PLAYER_POSITION: ~4/season → 0.12/day
// - NEW_YOUTH_PLAYER: ~3/season → 0.1/day
// - BONUS_100K: ~2/season → 0.06/day
// - LEVEL_UP_PLAYER_70: ~10/season → 0.3/day (+ ~20 from merge, medium amount reach level 70)
// - LEVEL_UP_PLAYER_100: ~2/season → 0.06/day (+ ~10 from merge, rare to reach level 100)
export const actionCardChances = {
  FRESHNESS_5: 0,
  FRESHNESS_10: 0.88,
  FRESHNESS_20: 0,
  LEVEL_UP_PLAYER_40: 1.2,
  CHANGE_PLAYER_POSITION: 0.12,
  NEW_YOUTH_PLAYER: 0.1,
  BONUS_100K: 0.06,
  LEVEL_UP_PLAYER_70: 0.3,
  LEVEL_UP_PLAYER_100: 0.06
}

/**
 * @param {TeamType} team
 * @returns {Promise<ActionCardType[]>}
 */
export async function getActionCards (team) {
  return await query("SELECT * FROM action_card WHERE team_id=? AND played=0 AND state='received'", [team.id])
}

/**
 * @param {TeamType} team
 * @returns {Promise<ActionCardType[]>}
 */
export async function getPendingActionCards (team) {
  return await query("SELECT * FROM action_card WHERE team_id=? AND state='pending'", [team.id])
}

/**
 * @param {number} cardId
 * @param {number} teamId
 * @returns {Promise<ActionCardType>}
 */
export async function claimActionCard (cardId, teamId) {
  const [card] = await query("SELECT * FROM action_card WHERE id=? AND team_id=? AND state='pending'", [cardId, teamId])
  if (!card) throw new BadRequestError('Card not found or already claimed')
  await query("UPDATE action_card SET state='received' WHERE id=?", [cardId])
  return { ...card, state: 'received' }
}

/**
 * Delete all pending action cards (expired - user didn't claim before next game day)
 * @returns {Promise<void>}
 */
export async function deleteExpiredPendingCards () {
  const result = await query("DELETE FROM action_card WHERE state='pending'")
  if (result.affectedRows > 0) {
    console.log(`🗑️ Deleted ${result.affectedRows} expired pending action cards`)
  }
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
 * @param {string} [locale]
 * @returns {Promise<{success: boolean}>}
 */
export async function playActionCard ({
  player: p,
  position,
  actionCard
}, team, locale) {
  // Get locale if not provided
  if (!locale && team.user_id) {
    locale = await getUserLocale(team.user_id)
  }
  locale = locale || 'en'

  const freshnessValues = { FRESHNESS_5: 0.05, FRESHNESS_10: 0.1, FRESHNESS_20: 0.2 }
  if (actionCard.action in freshnessValues) {
    const player = await getPlayerById(p.id)
    player.freshness = Math.min(1.0, player.freshness + freshnessValues[actionCard.action])
    await query('UPDATE player SET freshness=? WHERE id=?', [player.freshness, player.id])
    await query("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
    return { success: true }
  }
  const levelUpCaps = {
    LEVEL_UP_PLAYER_40: { max: 40, errorKey: 'error.cardMaxLevel40' },
    LEVEL_UP_PLAYER_70: { max: 70, errorKey: 'error.cardMaxLevel70' },
    LEVEL_UP_PLAYER_100: { max: 100, errorKey: 'error.playerMaxLevel' }
  }
  if (actionCard.action in levelUpCaps) {
    const { max, errorKey } = levelUpCaps[actionCard.action]
    const player = await getPlayerById(p.id)
    if (await levelUpsCurrentSeason(player) >= 20) {
      throw new BadRequestError(t('error.playerMaxLevelUps', {}, locale))
    }
    if (player.level >= max) {
      throw new BadRequestError(t(errorKey, {}, locale))
    }
    player.level += 1
    await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
    await query("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
    await addLogMessage(t('log.cardLevelUp', { playerName: player.name, level: player.level }, locale), team, null, null, 'level-up')
    await addPlayerHistory(player.id, 'LEVEL_UP', player.level)
    return { success: true }
  }
  if (actionCard.action === 'CHANGE_PLAYER_POSITION') {
    const player = await getPlayerById(p.id)
    if (player.position === 'GK') {
      throw new BadRequestError(t('error.goalkeeperCannotChange', {}, locale))
    }
    if (position === 'GK') {
      throw new BadRequestError(t('error.cannotBecomeGoalkeeper', {}, locale))
    }
    await query('UPDATE player SET position=? WHERE id=?', [position, p.id])
    await query("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
    await addPlayerHistory(p.id, 'CHANGE_PLAYER_POSITION', position)
    return { success: true }
  }
  if (actionCard.action === 'NEW_YOUTH_PLAYER') {
    const { season } = await getGameDayAndSeason()
    const youthPlayer = await createYouthPlayer(team.id, season)
    await query("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
    await addLogMessage(t('log.cardYouth', { playerName: youthPlayer.name }, locale), team, null, null, 'child')
    return { success: true }
  }
  if (actionCard.action === 'BONUS_100K') {
    const {
      gameDay,
      season
    } = await getGameDayAndSeason()
    await updateTeamBalance(team, 100000, t('finance.actionCardBonus', {}, locale), gameDay, season)
    await query("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
    await addLogMessage(t('log.cardMoney', { amount: '100,000€' }, locale), team, null, null, 'money')
    return { success: true }
  }
  throw new BadRequestError(t('error.invalidCardAction', {}, locale))
}

/**
 * Merge two action cards of the same type into a better one
 * @param {ActionCardType} actionCard1
 * @param {ActionCardType} actionCard2
 * @param {TeamType} team
 * @param {string} [locale]
 * @returns {Promise<{success: boolean, newCardType: string}>}
 */
export async function mergeActionCards (actionCard1, actionCard2, team, locale = 'en') {
  if (actionCard2.action !== actionCard1.action) {
    throw new BadRequestError(t('error.cannotMergeCards', {}, locale))
  }
  if (actionCard1.action !== 'LEVEL_UP_PLAYER_40' && actionCard1.action !== 'LEVEL_UP_PLAYER_70') {
    throw new BadRequestError(t('error.cannotMergeCards', {}, locale))
  }
  const newCardType = actionCard1.action === 'LEVEL_UP_PLAYER_40' ? 'LEVEL_UP_PLAYER_70' : 'LEVEL_UP_PLAYER_100'
  await query('DELETE FROM action_card WHERE id=?', [actionCard1.id])
  await query('DELETE FROM action_card WHERE id=?', [actionCard2.id])
  await query('INSERT INTO action_card SET ?', {
    team_id: team.id,
    action: newCardType,
    played: 0,
    state: 'received'
  })
  return { success: true, newCardType }
}
