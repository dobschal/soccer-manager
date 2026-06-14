import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { t, getUserLocale } from '../i18n/index.js'
import { getPlayersByTeamId, MAX_TEAM_SIZE } from '../helper/playerHelper.js'
import { getYouthAcademyLevel } from '../helper/buildingHelper.js'
import {
  getYouthPlayersByTeam,
  getYouthPlayerById,
  getYouthPlayerAge,
  promoteYouthPlayer,
  fireYouthPlayer,
  setYouthTrainingMode,
  setYouthPlayerTrainingMode,
  countYouthPlayersInMode
} from '../helper/youthPlayerHelper.js'

const VALID_TRAINING_MODES = ['training', 'friendly_match', 'rest']
const MAX_SLOTS_PER_MODE = 3

export default {

  /**
   * Get youth team data including players, individual training assignments,
   * and the youth academy level (which determines how many slots are
   * available per training mode).
   * @param {Request} req
   * @returns {Promise<{youthPlayers: YouthPlayerType[], trainingMode: string, academyLevel: number, slotsPerMode: number, season: number}>}
   */
  async getYouthTeam (req) {
    const team = await getTeam(req)
    const { season } = await getGameDayAndSeason()
    const youthPlayers = await getYouthPlayersByTeam(team.id)
    const academyLevel = await getYouthAcademyLevel(team.id)
    const slotsPerMode = Math.max(1, Math.min(MAX_SLOTS_PER_MODE, academyLevel))

    // Add age to each player (but not talent - that's hidden)
    const playersWithAge = youthPlayers.map(p => ({
      ...p,
      age: getYouthPlayerAge(p, season),
      talent: undefined // Remove talent from response - it's hidden
    }))

    return {
      youthPlayers: playersWithAge,
      trainingMode: team.youth_training_mode || 'rest',
      academyLevel,
      slotsPerMode,
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
      const slotsPerMode = Math.max(1, Math.min(MAX_SLOTS_PER_MODE, academyLevel))
      const used = await countYouthPlayersInMode(team.id, mode, youthPlayerId)
      if (used >= slotsPerMode) {
        throw new BadRequestError(t('error.youthModeSlotsFull', {}, locale))
      }
    }

    await setYouthPlayerTrainingMode(youthPlayerId, mode ?? null)
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
  }
}
