import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { sendToUser } from '../lib/websocket.js'

const VALID_TUTORIAL_KEYS = ['results', 'team', 'trades', 'dashboard', 'stadium', 'finances', 'youth', 'buildings']

export default {

  /**
   * @param {Request} req
   * @returns {Promise<{tutorialCompleted: Object}>}
   */
  async getTutorialStatus (req) {
    const team = await getTeam(req)
    const tutorialCompleted = JSON.parse(team.tutorial_completed || '{}')
    return { tutorialCompleted }
  },

  /**
   * @param {string} tutorialKey
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async completeTutorial (tutorialKey, req) {
    if (!VALID_TUTORIAL_KEYS.includes(tutorialKey)) {
      throw new BadRequestError('Invalid tutorial key')
    }
    const team = await getTeam(req)
    const tutorialCompleted = JSON.parse(team.tutorial_completed || '{}')
    tutorialCompleted[tutorialKey] = true
    await query('UPDATE team SET tutorial_completed=? WHERE id=?', [JSON.stringify(tutorialCompleted), team.id])

    // Send WebSocket event to notify client of tutorial completion
    if (team.user_id) {
      sendToUser(team.user_id, 'TUTORIAL_COMPLETED', { tutorialKey, tutorialCompleted })
    }

    return { success: true }
  }
}
