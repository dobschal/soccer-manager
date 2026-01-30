import { prepareSeason } from '../prepare-season.js'
import { calculateGames } from '../play-game-day.js'
import { makeBotMoves } from '../bot-move.js'
import { BadRequestError } from '../lib/errors.js'

export default {
  /**
   * Returns whether development mode is enabled
   * @returns {Promise<{isDevelopment: boolean}>}
   */
  async isDevelopment () {
    return { isDevelopment: process.env.IS_DEVELOPMENT === 'true' }
  },

  /**
   * Manually triggers the CRON job (only in development mode)
   * @returns {Promise<{success: boolean}>}
   */
  async triggerGameDay () {
    if (process.env.IS_DEVELOPMENT !== 'true') {
      throw new BadRequestError('This action is only available in development mode')
    }
    console.log('Manually triggered game day calculation...')
    await prepareSeason()
    await makeBotMoves()
    await calculateGames()
    console.log('Game day calculation completed.')
    return { success: true }
  }
}
