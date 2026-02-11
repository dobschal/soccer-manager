import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { t, getUserLocale } from '../i18n/index.js'
import {
  getYouthPlayersByTeam,
  getYouthPlayerById,
  getYouthPlayerAge,
  promoteYouthPlayer,
  fireYouthPlayer,
  setYouthTrainingMode
} from '../helper/youthPlayerHelper.js'

export default {

  /**
   * Get youth team data including players and training mode
   * @param {Request} req
   * @returns {Promise<{youthPlayers: YouthPlayerType[], trainingMode: string, season: number}>}
   */
  async getYouthTeam (req) {
    const team = await getTeam(req)
    const { season } = await getGameDayAndSeason()
    const youthPlayers = await getYouthPlayersByTeam(team.id)

    // Add age to each player (but not talent - that's hidden)
    const playersWithAge = youthPlayers.map(p => ({
      ...p,
      age: getYouthPlayerAge(p, season),
      talent: undefined // Remove talent from response - it's hidden
    }))

    return {
      youthPlayers: playersWithAge,
      trainingMode: team.youth_training_mode || 'rest',
      season
    }
  },

  /**
   * Set the training mode for youth team
   * @param {string} mode - 'training', 'friendly_match', or 'rest'
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async setYouthTrainingMode (mode, req) {
    const validModes = ['training', 'friendly_match', 'rest']
    if (!validModes.includes(mode)) {
      throw new BadRequestError('Invalid training mode')
    }

    const team = await getTeam(req)
    await setYouthTrainingMode(team.id, mode)
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

    if (youthPlayer.level < 1) {
      throw new BadRequestError(t('error.youthPlayerLevelTooLow', {}, locale))
    }

    const player = await promoteYouthPlayer(youthPlayer, season)

    await addLogMessage(
      t('log.youthPlayerPromoted', { playerName: youthPlayer.name, level: player.level }, locale),
      team,
      null,
      null,
      'arrow-up'
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
      'user-times'
    )

    return { success: true }
  }
}
