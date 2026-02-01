import { getLogMessages } from '../helper/logMessageHelper.js'

export default {
  /**
   * @param {number} pageIndex
   * @param {number} pageSize
   * @param {Request} [req]
   * @returns {Promise<Array<LogMessageType>>}
   */
  async getLogMessages (pageIndex, pageSize, req) {
    return await getLogMessages(pageIndex, pageSize, req)
  }
}
