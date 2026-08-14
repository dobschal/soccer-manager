import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { updateTeamBalance } from '../helper/financeHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { addPlayerHistory } from '../helper/playerHistoryHelper.js'
import { t, getUserLocale } from '../i18n/index.js'
import { getPlayersByTeamId, MAX_TEAM_SIZE } from '../helper/playerHelper.js'
import { getYouthAcademyLevel } from '../helper/buildingHelper.js'
import { sendToUser } from '../lib/websocket.js'
import { SERVER_EVENTS } from '../../client/lib/serverEvents.js'
import {
  getYouthPlayersByTeam,
  getYouthPlayerById,
  getYouthPlayerAge,
  promoteYouthPlayer,
  fireYouthPlayer,
  setYouthTrainingMode,
  setYouthPlayerTrainingMode,
  countYouthPlayersInMode,
  calculateYouthPlayerValue
} from '../helper/youthPlayerHelper.js'

const VALID_TRAINING_MODES = ['training', 'friendly_match', 'rest']
const MAX_SLOTS_PER_MODE = 4

/**
 * Slot capacity per training mode. `rest` is always 4. `training` and
 * `friendly_match` start at 2 (academy level 1) and gain one slot per
 * additional academy level, capped at MAX_SLOTS_PER_MODE.
 * @param {string} mode
 * @param {number} academyLevel
 * @returns {number}
 */
function slotsForMode (mode, academyLevel) {
  if (mode === 'rest') return MAX_SLOTS_PER_MODE
  return Math.max(2, Math.min(MAX_SLOTS_PER_MODE, academyLevel + 1))
}

/**
 * @param {number} academyLevel
 * @returns {{training: number, friendly_match: number, rest: number}}
 */
function slotsByModeFor (academyLevel) {
  return {
    training: slotsForMode('training', academyLevel),
    friendly_match: slotsForMode('friendly_match', academyLevel),
    rest: slotsForMode('rest', academyLevel)
  }
}

export default {

  /**
   * Get youth team data including players, individual training assignments,
   * and the youth academy level (which determines how many slots are
   * available per training mode).
   * @param {Request} req
   * @returns {Promise<{youthPlayers: YouthPlayerType[], trainingMode: string, academyLevel: number, slotsByMode: {training: number, friendly_match: number, rest: number}, season: number}>}
   */
  async getYouthTeam (req) {
    const team = await getTeam(req)
    const { season } = await getGameDayAndSeason()
    const youthPlayers = await getYouthPlayersByTeam(team.id)
    const academyLevel = await getYouthAcademyLevel(team.id)

    // Add age and sale value to each player (but not talent - that's hidden).
    // The value is computed here rather than on the client precisely because
    // it depends on the hidden talent (#524).
    const playersWithAge = youthPlayers.map(p => ({
      ...p,
      age: getYouthPlayerAge(p, season),
      market_value: calculateYouthPlayerValue(p, season),
      talent: undefined // Remove talent from response - it's hidden
    }))

    return {
      youthPlayers: playersWithAge,
      trainingMode: team.youth_training_mode || 'rest',
      academyLevel,
      slotsByMode: slotsByModeFor(academyLevel),
      season
    }
  },

  /**
   * Legacy: set the team-wide training mode (kept as a no-conflict fallback
   * for processYouthTraining when individual modes are unset).
   * @param {string} mode - 'training', 'friendly_match', or 'rest'
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async setYouthTrainingMode (mode, req) {
    if (!VALID_TRAINING_MODES.includes(mode)) {
      throw new BadRequestError('Invalid training mode')
    }

    const team = await getTeam(req)
    await setYouthTrainingMode(team.id, mode)
    return { success: true }
  },

  /**
   * Assign one youth player to a specific training mode, or unassign with
   * `null`. The destination mode is capped at `min(academyLevel, 3)` slots.
   * @param {number} youthPlayerId
   * @param {string|null} mode
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async setYouthPlayerTrainingMode (youthPlayerId, mode, req) {
    const team = await getTeam(req)
    const locale = await getUserLocale(team.user_id)

    if (mode !== null && mode !== undefined && !VALID_TRAINING_MODES.includes(mode)) {
      throw new BadRequestError(t('error.youthInvalidTrainingMode', {}, locale))
    }

    const youthPlayer = await getYouthPlayerById(youthPlayerId)
    if (!youthPlayer) {
      throw new BadRequestError(t('error.youthPlayerNotFound', {}, locale))
    }
    if (youthPlayer.team_id !== team.id) {
      throw new BadRequestError(t('error.notYourYouthPlayer', {}, locale))
    }

    if (mode) {
      const academyLevel = await getYouthAcademyLevel(team.id)
      const limit = slotsForMode(mode, academyLevel)
      const used = await countYouthPlayersInMode(team.id, mode, youthPlayerId)
      if (used >= limit) {
        throw new BadRequestError(t('error.youthModeSlotsFull', {}, locale))
      }
    }

    const newMode = mode ?? null
    const previousMode = youthPlayer.training_mode ?? null
    await setYouthPlayerTrainingMode(youthPlayerId, newMode)

    if (team.user_id && previousMode !== newMode) {
      sendToUser(team.user_id, SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name, {
        youthPlayerId,
        previousMode,
        newMode
      })
    }

    return { success: true }
  },

  /**
   * Promote a youth player to the A Team
   * @param {number} youthPlayerId
   * @param {Request} req
   * @returns {Promise<{success: boolean, player: PlayerType}>}
   */
  async promoteYouthPlayer (youthPlayerId, req) {
    const team = await getTeam(req)
    const { season } = await getGameDayAndSeason()
    const locale = await getUserLocale(team.user_id)

    const youthPlayer = await getYouthPlayerById(youthPlayerId)
    if (!youthPlayer) {
      throw new BadRequestError(t('error.youthPlayerNotFound', {}, locale))
    }
    if (youthPlayer.team_id !== team.id) {
      throw new BadRequestError(t('error.notYourYouthPlayer', {}, locale))
    }

    const age = getYouthPlayerAge(youthPlayer, season)
    if (age < 16) {
      throw new BadRequestError(t('error.youthPlayerTooYoung', {}, locale))
    }

    const teamPlayers = await getPlayersByTeamId(team.id)
    if (teamPlayers.length >= MAX_TEAM_SIZE) {
      throw new BadRequestError(t('error.teamTooLarge', {}, locale))
    }

    const player = await promoteYouthPlayer(youthPlayer, season)

    await addPlayerHistory(player.id, 'YOUTH_PROMOTION', team.name)

    await addLogMessage(
      t('log.youthPlayerPromoted', { playerName: youthPlayer.name, level: player.level }, locale),
      team,
      null,
      null,
      'arrow-up',
      undefined,
      'success'
    )

    return { success: true, player }
  },

  /**
   * Fire (delete) a youth player
   * @param {number} youthPlayerId
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async fireYouthPlayer (youthPlayerId, req) {
    const team = await getTeam(req)
    const locale = await getUserLocale(team.user_id)

    const youthPlayer = await getYouthPlayerById(youthPlayerId)
    if (!youthPlayer) {
      throw new BadRequestError(t('error.youthPlayerNotFound', {}, locale))
    }
    if (youthPlayer.team_id !== team.id) {
      throw new BadRequestError(t('error.notYourYouthPlayer', {}, locale))
    }

    await fireYouthPlayer(youthPlayerId)

    await addLogMessage(
      t('log.youthPlayerFired', { playerName: youthPlayer.name }, locale),
      team,
      null,
      null,
      'user-times',
      undefined,
      'info'
    )

    return { success: true }
  },

  /**
   * Sell a youth player at their current market value (#524). The club is
   * credited and the player leaves the academy — there is no buying team, the
   * transfer market only trades professionals.
   * @param {number} youthPlayerId
   * @param {Request} req
   * @returns {Promise<{success: boolean, value: number}>}
   */
  async sellYouthPlayer (youthPlayerId, req) {
    const team = await getTeam(req)
    const locale = await getUserLocale(team.user_id)
    const { gameDay, season } = await getGameDayAndSeason()

    const youthPlayer = await getYouthPlayerById(youthPlayerId)
    if (!youthPlayer) {
      throw new BadRequestError(t('error.youthPlayerNotFound', {}, locale))
    }
    if (youthPlayer.team_id !== team.id) {
      throw new BadRequestError(t('error.notYourYouthPlayer', {}, locale))
    }

    const value = calculateYouthPlayerValue(youthPlayer, season)
    // Remove first: if the payout were booked first and the delete then failed,
    // the club would keep both the money and the player.
    await fireYouthPlayer(youthPlayerId)
    await updateTeamBalance(team, value, t('finance.youthPlayerSold', { playerName: youthPlayer.name }, locale), gameDay, season)

    await addLogMessage(
      t('log.youthPlayerSold', { playerName: youthPlayer.name, value }, locale),
      team,
      null,
      null,
      'money',
      undefined,
      'success'
    )

    return { success: true, value }
  }
}
