import { prepareSeason } from '../prepare-season.js'
import { calculateGames } from '../play-game-day.js'
import { makeBotMoves } from '../bot-move.js'
import { BadRequestError } from '../lib/errors.js'
import { cleanupOldFreePlayers } from '../helper/playerHelper.js'
import { cleanupIOCPlayers, fillMarketGaps, iocBuyUndervaluedPlayers } from '../helper/overseaClubHelper.js'
import { config } from '../config.js'
import { sendTestPushNotification } from '../lib/pushNotification.js'

export default {
  /**
   * Manually triggers the CRON job (admin only)
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async triggerGameDay (req) {
    if (req.user?.username !== config.ADMIN_USERNAME) {
      throw new BadRequestError('This action is only available for the admin')
    }
    console.log('Manually triggered game day calculation...')
    await prepareSeason()
    await calculateGames()
    await makeBotMoves()
    await cleanupOldFreePlayers()
    await cleanupIOCPlayers()
    await fillMarketGaps()
    await iocBuyUndervaluedPlayers()
    console.log('Game day calculation completed.')
    return { success: true }
  },

  /**
   * Send a test push notification to a specific device token
   * @param {string} deviceToken
   * @param {string} message
   * @param {Request} req
   * @returns {Promise<{sent: number, failed: number, failureReason: string|null}>}
   */
  async testPushNotification (deviceToken, message, req) {
    if (req.user?.username !== config.ADMIN_USERNAME) {
      throw new BadRequestError('This action is only available for the admin')
    }
    if (typeof deviceToken !== 'string' || !deviceToken) {
      throw new BadRequestError('deviceToken is required')
    }
    if (typeof message !== 'string' || !message) {
      throw new BadRequestError('message is required')
    }
    return sendTestPushNotification(deviceToken, message)
  }
}
