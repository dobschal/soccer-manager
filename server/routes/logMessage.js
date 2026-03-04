import { getLogMessages, getLogMessageCount, getNewLogMessageCount, deleteLogMessage } from '../helper/logMessageHelper.js'

export default {
  /**
   * @param {number} pageIndex
   * @param {number} pageSize
   * @param {Request} [req]
   * @returns {Promise<Array<LogMessageType>>}
   */
  async getLogMessages (pageIndex, pageSize, req) {
    return await getLogMessages(pageIndex, pageSize, req)
  },

  /**
   * @param {Request} req
   * @returns {Promise<{count: number}>}
   */
  async getLogMessageCount (req) {
    const count = await getLogMessageCount(req)
    return { count }
  },

  /**
   * @param {number} lastSeenId
   * @param {Request} req
   * @returns {Promise<{count: number}>}
   */
  async getNewLogMessageCount (lastSeenId, req) {
    const count = await getNewLogMessageCount(lastSeenId, req)
    return { count }
  },

  /**
   * @param {number} messageId
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async deleteLogMessage (messageId, req) {
    await deleteLogMessage(messageId, req)
    return { success: true }
  }
}
