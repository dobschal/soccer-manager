import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { addLogMessage } from './logMessageHelper.js'
import { addPlayerHistory } from './playerHistoryHelper.js'
import { getPlayerById } from './playerHelper.js'
import { getTeamById } from './teamHelper.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { updateTeamBalance } from './financeHelper.js'
import { getUserLocale, t } from '../i18n/index.js'
import { createYouthPlayer } from './youthPlayerHelper.js'
import { randomItem, truncateChars } from '../lib/util.js'
import { Position } from '../../client/util/formation.js'
import { generateRandomPlayerName } from '../prepare-season.js'
import { sendToUser } from '../lib/websocket.js'
import { SERVER_EVENTS } from '../../client/lib/serverEvents.js'

// Probabilities per game day (34 game days per season)
// Note: 2x LEVEL_UP_40 can merge into 1x LEVEL_UP_70, and 2x LEVEL_UP_70 into 1x LEVEL_UP_100
// Levels are now 1-100 (was 1-10). Cards still give +1 level per use but appear 10x more often.
//
// - LEVEL_UP_PLAYER_40: ~40/season → 1.2/day (can merge into ~20 LEVEL_UP_70)
// - FRESHNESS_10: ~30/season → 0.88/day
// - NEW_YOUTH_PLAYER_1/_2/_3: chances overridden per youth academy level (see buildingHelper)
// - BONUS_100K: ~2/season → 0.06/day
// - MILLION_BONUS: a tenth of the cash bonus (#537) → 0.006/day, ~0.2/season
// - LEVEL_UP_PLAYER_70: ~10/season → 0.3/day (+ ~20 from merge, medium amount reach level 70)
// - LEVEL_UP_PLAYER_100: ~2/season → 0.06/day (+ ~10 from merge, rare to reach level 100)
export const actionCardChances = {
  FRESHNESS_5: 0,
  FRESHNESS_10: 0.88,
  FRESHNESS_20: 0,
  LEVEL_UP_PLAYER_40: 1.2,
  NEW_YOUTH_PLAYER_1: 0,
  NEW_YOUTH_PLAYER_2: 0,
  NEW_YOUTH_PLAYER_3: 0,
  BONUS_100K: 0.06,
  // Deliberately derived from BONUS_100K so the two stay in step (#537).
  MILLION_BONUS: 0.06 * 0.1,
  LEVEL_UP_PLAYER_70: 0.3,
  LEVEL_UP_PLAYER_100: 0.06,
  STAR_PLAYER: 0.01,
  MOTIVATING_SPEECH: 0.05,
  // ~5 per season (34 game days): 5 / 34 ≈ 0.15 expected cards per game day.
  SPY: 0.15,
  // Only teams with a medical practice ever get this one; the chance is
  // overridden per practice level (see MEDICAL_PRACTICE_CARD_CHANCES).
  MEDICAL_TREATMENT: 0
}

/**
 * How much each cash card pays out. Kept as a table so a new denomination is a
 * one-line change instead of another branch in `playActionCard`.
 * @type {Record<string, number>}
 */
export const CASH_CARD_AMOUNTS = {
  BONUS_100K: 100_000,
  MILLION_BONUS: 1_000_000
}

/**
 * Level and talent ranges for youth player action cards.
 * The card type determines the strength of the recruited youth player.
 */
export const YOUTH_PLAYER_CARD_RANGES = {
  NEW_YOUTH_PLAYER_1: { levelMin: 1, levelMax: 5, talentMin: 0.1, talentMax: 0.5 },
  NEW_YOUTH_PLAYER_2: { levelMin: 5, levelMax: 10, talentMin: 0.3, talentMax: 0.75 },
  NEW_YOUTH_PLAYER_3: { levelMin: 10, levelMax: 15, talentMin: 0.5, talentMax: 1.0 }
}

/**
 * The set of action types that recruit a new youth player.
 */
export const NEW_YOUTH_PLAYER_ACTIONS = new Set([
  'NEW_YOUTH_PLAYER_1',
  'NEW_YOUTH_PLAYER_2',
  'NEW_YOUTH_PLAYER_3'
])

/**
 * Maximum number of youth player action cards a team may receive per season.
 * Once a team has been handed this many youth cards in a season, no further
 * youth cards are dealt for the rest of that season. The guaranteed youth
 * card (given to teams with no youth player yet) counts toward this limit.
 */
export const MAX_YOUTH_CARDS_PER_SEASON = 3

/**
 * Generate 3 random youth player options for an action card.
 * @param {string} action - one of NEW_YOUTH_PLAYER_1/_2/_3
 * @returns {Promise<Array<{name: string, position: string, level: number, talent: number, hair_color: number, skin_color: number}>>}
 */
export async function generateYouthPlayerOptions (action) {
  const range = YOUTH_PLAYER_CARD_RANGES[action]
  if (!range) throw new BadRequestError('Invalid youth player card action')
  // Pick 3 distinct positions so the offered players don't all share the same one.
  const positions = Object.values(Position)
    .map(position => ({ position, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 3)
    .map(({ position }) => position)
  const options = []
  for (let i = 0; i < 3; i++) {
    options.push({
      name: await generateRandomPlayerName(),
      position: positions[i],
      level: range.levelMin + Math.random() * (range.levelMax - range.levelMin),
      talent: range.talentMin + Math.random() * (range.talentMax - range.talentMin),
      hair_color: Math.floor(Math.random() * 7),
      skin_color: Math.floor(Math.random() * 4)
    })
  }
  return options
}

/**
 * Validate and sanitize a selected youth player option submitted by the client.
 * @param {string} action
 * @param {any} option
 * @returns {{name: string, position: string, level: number, talent: number, hair_color: number, skin_color: number}}
 */
function _validateYouthPlayerOption (action, option) {
  const range = YOUTH_PLAYER_CARD_RANGES[action]
  if (!range) throw new BadRequestError('Invalid youth player card action')
  if (!option || typeof option !== 'object') {
    throw new BadRequestError('Invalid youth player option')
  }
  const validPositions = Object.values(Position)
  const name = truncateChars(option.name, 64)
  const position = validPositions.includes(option.position) ? option.position : randomItem(validPositions)
  const level = Math.min(range.levelMax, Math.max(range.levelMin, Number(option.level)))
  const talent = Math.min(range.talentMax, Math.max(range.talentMin, Number(option.talent)))
  const hairColor = Math.min(6, Math.max(0, Math.floor(Number(option.hair_color) || 0)))
  const skinColor = Math.min(3, Math.max(0, Math.floor(Number(option.skin_color) || 0)))
  if (!name) throw new BadRequestError('Invalid youth player option name')
  if (!Number.isFinite(level) || !Number.isFinite(talent)) {
    throw new BadRequestError('Invalid youth player option values')
  }
  return {
    name,
    position,
    level,
    talent,
    hair_color: hairColor,
    skin_color: skinColor
  }
}

/**
 * @param {TeamType} team
 * @returns {Promise<ActionCardType[]>}
 */
export async function getActionCards (team) {
  return await query('SELECT * FROM action_card WHERE team_id=? AND played=0 AND state=\'received\'', [team.id])
}

/**
 * @param {TeamType} team
 * @returns {Promise<ActionCardType[]>}
 */
export async function getPendingActionCards (team) {
  return await query('SELECT * FROM action_card WHERE team_id=? AND state=\'pending\'', [team.id])
}

/**
 * Maximum number of *received* (claimed, unplayed) action cards a team may
 * hold per action type. Claiming a card of a type already at this limit is
 * rejected with an error the client surfaces as a toast. Existing stacks that
 * are already above the limit (from before it was introduced) are left
 * untouched — they simply can't grow any further until played down.
 * Keep in sync with the client copy in client/pages/dashboard/actionCards.js.
 */
export const MAX_ACTION_CARDS_PER_TYPE = 20

/**
 * Whether a team may still be handed another action card of `action`.
 *
 * A card can only be *claimed* while the team holds fewer than
 * MAX_ACTION_CARDS_PER_TYPE received cards of that type (see claimActionCard).
 * Handing out a card that would push the held-or-pending total past that limit
 * produces a card that can never be claimed — it stays `pending` forever and
 * traps the user on the dashboard claim overlay. Distribution sites must check
 * this first and simply not deal the card when it returns false.
 *
 * Counts both `received` (claimed, unplayed) and `pending` (dealt, unclaimed)
 * cards so a backlog of unclaimed pending cards of a type also stops further
 * dealing of that type.
 *
 * @param {number} teamId
 * @param {string} action
 * @returns {Promise<boolean>}
 */
export async function canReceiveActionCard (teamId, action) {
  const [{ heldCount }] = await query(
    "SELECT COUNT(*) AS heldCount FROM action_card WHERE team_id=? AND action=? AND played=0 AND state IN ('received','pending')",
    [teamId, action]
  )
  return heldCount < MAX_ACTION_CARDS_PER_TYPE
}

/**
 * @param {number} cardId
 * @param {number} teamId
 * @param {string} [locale]
 * @returns {Promise<ActionCardType>}
 */
export async function claimActionCard (cardId, teamId, locale = 'en') {
  const [card] = await query('SELECT * FROM action_card WHERE id=? AND team_id=? AND state=\'pending\'', [cardId, teamId])
  if (!card) throw new BadRequestError('Card not found or already claimed')
  const [{ heldCount }] = await query(
    'SELECT COUNT(*) AS heldCount FROM action_card WHERE team_id=? AND action=? AND played=0 AND state=\'received\'',
    [teamId, card.action]
  )
  if (heldCount >= MAX_ACTION_CARDS_PER_TYPE) {
    throw new BadRequestError(t('error.actionCardLimitReached', { max: MAX_ACTION_CARDS_PER_TYPE }, locale))
  }
  await query('UPDATE action_card SET state=\'received\' WHERE id=?', [cardId])
  return {
    ...card,
    state: 'received'
  }
}

/**
 * Delete all pending action cards (expired - user didn't claim before next game day)
 * @returns {Promise<void>}
 */
export async function deleteExpiredPendingCards () {
  const result = await query('DELETE FROM action_card WHERE state=\'pending\'')
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
 * @param {ActionCardType} actionCard
 * @param {TeamType} team
 * @param {string} [locale]
 * @returns {Promise<{success: boolean}>}
 */
export async function playActionCard ({
  player: p,
  actionCard,
  position
}, team, locale) {
  // Get locale if not provided
  if (!locale && team.user_id) {
    locale = await getUserLocale(team.user_id)
  }
  locale = locale || 'en'

  const freshnessValues = {
    FRESHNESS_5: 0.05,
    FRESHNESS_10: 0.1,
    FRESHNESS_20: 0.2
  }
  if (actionCard.action in freshnessValues) {
    const player = await getPlayerById(p.id)
    player.freshness = Math.min(1.0, player.freshness + freshnessValues[actionCard.action])
    await query('UPDATE player SET freshness=? WHERE id=?', [player.freshness, player.id])
    await query('UPDATE action_card SET played=1, state=\'played\' WHERE id=?', [actionCard.id])
    await _emitPlayerUpdated(team, player.id)
    return { success: true }
  }
  const levelUpCaps = {
    LEVEL_UP_PLAYER_40: {
      max: 40,
      errorKey: 'error.cardMaxLevel40'
    },
    LEVEL_UP_PLAYER_70: {
      max: 70,
      errorKey: 'error.cardMaxLevel70'
    },
    LEVEL_UP_PLAYER_100: {
      max: 100,
      errorKey: 'error.playerMaxLevel'
    }
  }
  if (actionCard.action in levelUpCaps) {
    const {
      max,
      errorKey
    } = levelUpCaps[actionCard.action]
    const player = await getPlayerById(p.id)
    if (await levelUpsCurrentSeason(player) >= 20) {
      throw new BadRequestError(t('error.playerMaxLevelUps', {}, locale))
    }
    if (player.level >= max) {
      throw new BadRequestError(t(errorKey, {}, locale))
    }
    player.level += 1
    await query('UPDATE player SET level=? WHERE id=?', [player.level, player.id])
    await query('UPDATE action_card SET played=1, state=\'played\' WHERE id=?', [actionCard.id])
    await addLogMessage(t('log.cardLevelUp', {
      playerName: player.name,
      level: player.level
    }, locale), team, null, null, 'level-up', undefined, 'success')
    await addPlayerHistory(player.id, 'LEVEL_UP', player.level)
    await _emitPlayerUpdated(team, player.id)
    return { success: true }
  }
  if (actionCard.action in YOUTH_PLAYER_CARD_RANGES) {
    const overrides = _validateYouthPlayerOption(actionCard.action, p)
    const { season } = await getGameDayAndSeason()
    const youthPlayer = await createYouthPlayer(team.id, season, overrides)
    await query('UPDATE action_card SET played=1, state=\'played\' WHERE id=?', [actionCard.id])
    await addLogMessage(t('log.cardYouth', { playerName: youthPlayer.name }, locale), team, null, null, 'child', undefined, 'success')
    return { success: true }
  }
  if (actionCard.action === 'STAR_PLAYER') {
    const player = await getPlayerById(p.id)
    if (player.team_id !== team.id) {
      throw new BadRequestError(t('error.playerNotInTeam', {}, locale))
    }
    if (player.is_star_player) {
      throw new BadRequestError(t('error.alreadyStarPlayer', {}, locale))
    }
    await query('UPDATE player SET is_star_player=1 WHERE id=?', [player.id])
    await query('UPDATE action_card SET played=1, state=\'played\' WHERE id=?', [actionCard.id])
    await addLogMessage(t('log.cardStarPlayer', { playerName: player.name }, locale), team, null, null, 'star', undefined, 'success')
    await addPlayerHistory(player.id, 'STAR_PLAYER', '1')
    await _emitPlayerUpdated(team, player.id)
    return { success: true }
  }
  if (actionCard.action === 'MEDICAL_TREATMENT') {
    const player = await getPlayerById(p.id)
    if (player.team_id !== team.id) {
      throw new BadRequestError(t('error.playerNotInTeam', {}, locale))
    }
    if (!player.is_injured) {
      throw new BadRequestError(t('error.playerNotInjured', {}, locale))
    }
    // One game day off the remaining lay-off. Hitting zero ends the injury right
    // away instead of waiting for `_recoverInjuredPlayers` to notice on the next
    // game day, so the player is available for today's match.
    const daysLeft = Math.max(0, (player.injury_days_left ?? 0) - 1)
    if (daysLeft > 0) {
      await query('UPDATE player SET injury_days_left=? WHERE id=?', [daysLeft, player.id])
    } else {
      await query(
        'UPDATE player SET is_injured=0, injury_type=NULL, injury_days_left=0 WHERE id=?',
        [player.id]
      )
    }
    await query('UPDATE action_card SET played=1, state=\'played\' WHERE id=?', [actionCard.id])
    await addLogMessage(
      daysLeft > 0
        ? t('log.cardMedicalTreatment', { playerName: player.name, days: daysLeft }, locale)
        : t('log.cardMedicalTreatmentHealed', { playerName: player.name }, locale),
      team, 'OPEN_PLAYER', player.id, 'medkit', undefined, 'success'
    )
    await _emitPlayerUpdated(team, player.id)
    return { success: true }
  }
  if (actionCard.action === 'BONUS_100K' || actionCard.action === 'MILLION_BONUS') {
    const {
      gameDay,
      season
    } = await getGameDayAndSeason()
    const amount = CASH_CARD_AMOUNTS[actionCard.action]
    await updateTeamBalance(team, amount, t('finance.actionCardBonus', {}, locale), gameDay, season)
    await query('UPDATE action_card SET played=1, state=\'played\' WHERE id=?', [actionCard.id])
    await addLogMessage(
      t('log.cardMoney', { amount: `${amount.toLocaleString('en-US')}€` }, locale),
      team, null, null, 'money', undefined, 'success'
    )
    return { success: true }
  }
  if (actionCard.action === 'MOTIVATING_SPEECH') {
    const [currentTeam] = await query('SELECT motivating_speech_active FROM team WHERE id=?', [team.id])
    if (currentTeam && currentTeam.motivating_speech_active) {
      throw new BadRequestError(t('error.motivatingSpeechAlreadyActive', {}, locale))
    }
    await query('UPDATE team SET motivating_speech_active=1 WHERE id=?', [team.id])
    await query('UPDATE action_card SET played=1, state=\'played\' WHERE id=?', [actionCard.id])
    await addLogMessage(t('log.cardMotivatingSpeech', {}, locale), team, null, null, 'bullhorn', undefined, 'info')
    return { success: true }
  }
  if (actionCard.action === 'SPY') {
    // The spy report is a point-in-time SNAPSHOT: we freeze the opponent's
    // tactics, lineup and active motivating-speech buff at the moment the card
    // is played, so later tactic changes by the opponent don't alter the
    // report (#513). The spied team id is passed through the `position` slot
    // (SPY has no lineup position).
    await query('UPDATE action_card SET played=1, state=\'played\' WHERE id=?', [actionCard.id])
    const spiedTeamId = Number(position)
    let report = null
    if (spiedTeamId) {
      const spiedTeam = await getTeamById(spiedTeamId)
      if (spiedTeam) {
        const players = await query('SELECT * FROM player WHERE team_id=?', [spiedTeamId])
        report = {
          team: spiedTeam,
          players,
          motivatingSpeechActive: !!spiedTeam.motivating_speech_active
        }
        await query(
          'UPDATE team SET last_spied_team_id=?, last_spied_at=NOW(), last_spied_snapshot=? WHERE id=?',
          [spiedTeamId, JSON.stringify(report), team.id]
        )
      }
    }
    return { success: true, report }
  }
  throw new BadRequestError(t('error.invalidCardAction', {}, locale))
}

/**
 * Push a fresh copy of the player to the owning user so every UI that shows
 * the player (list rows, lineup tiles, open modal, strength overlay) can
 * update itself off the event — no callback chain, no full-team refetch.
 * No-op when the team has no user (bot teams).
 * @param {TeamType} team
 * @param {number} playerId
 * @returns {Promise<void>}
 * @private
 */
async function _emitPlayerUpdated (team, playerId) {
  if (!team.user_id) return
  const fresh = await getPlayerById(playerId)
  if (!fresh) return
  sendToUser(team.user_id, SERVER_EVENTS.PLAYER_UPDATED.name, { player: fresh })
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
  const [first, second] = await _claimMergeInput(actionCard1, actionCard2, team, locale)
  const newCardType = first.action === 'LEVEL_UP_PLAYER_40' ? 'LEVEL_UP_PLAYER_70' : 'LEVEL_UP_PLAYER_100'
  const { season } = await getGameDayAndSeason()
  await query('DELETE FROM action_card WHERE id=?', [first.id])
  await query('DELETE FROM action_card WHERE id=?', [second.id])
  const result = await query('INSERT INTO action_card SET ?', {
    team_id: team.id,
    action: newCardType,
    played: 0,
    state: 'received',
    season
  })
  return {
    success: true,
    newCardType,
    actionCard: { id: result.insertId, action: newCardType }
  }
}

/**
 * Load both merge inputs straight from the database and refuse anything the
 * team does not actually hold free: a card that is escrowed in a marketplace
 * offer or bid must not be merged away, or the entry behind it would live on
 * pointing at a card that no longer exists. Clients work off a cached
 * inventory, so this cannot be left to them.
 * @param {ActionCardType} actionCard1
 * @param {ActionCardType} actionCard2
 * @param {TeamType} team
 * @param {string} locale
 * @returns {Promise<[ActionCardType, ActionCardType]>}
 * @private
 */
async function _claimMergeInput (actionCard1, actionCard2, team, locale) {
  const ids = [Number(actionCard1?.id), Number(actionCard2?.id)]
  if (!ids[0] || !ids[1] || ids[0] === ids[1]) {
    throw new BadRequestError(t('error.cannotMergeCards', {}, locale))
  }
  const cards = await query(
    "SELECT * FROM action_card WHERE id IN (?) AND team_id=? AND played=0 AND state='received'",
    [ids, team.id]
  )
  if (cards.length !== 2 || cards[0].action !== cards[1].action || cards[0].action !== actionCard1.action) {
    throw new BadRequestError(t('error.cardNotFound', {}, locale))
  }
  return cards
}
