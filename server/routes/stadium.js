import { buildStadium, calcuateStadiumBuild, getStadiumOfCurrentUser } from '../helper/stadiumHelper.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { query } from '../lib/database.js'

export default {

  /**
   * @param {number} teamId
   * @returns {Promise<StadiumType>}
   */
  async getStadiumByTeamId (teamId) {
    const stadiums = await query('SELECT * FROM stadium WHERE team_id=? LIMIT 1', [teamId])
    return stadiums[0]
  },

  /**
   * @param {Request} req
   * @returns {Promise<{stadium: StadiumType}>}
   */
  async getStadium (req) {
    return { stadium: await getStadiumOfCurrentUser(req) }
  },

  /**
   * @param {StadiumType} stadium
   * @param {Request} req
   * @returns {Promise<{totalPrice: number}>}
   */
  async calculateStadiumPrice (stadium, req) {
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== stadium.id) throw new UnauthorizedError('Not your stadium dude')
    return { totalPrice: calcuateStadiumBuild(currentStadium, stadium) }
  },

  /**
   * @param {StadiumType} stadium
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async buildStadium (stadium, req) {
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== stadium.id) throw new UnauthorizedError('Not your stadium dude')
    const price = calcuateStadiumBuild(currentStadium, stadium)
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    if (team.balance < price) throw new BadRequestError('Not enough money...')
    await buildStadium(team, stadium, price)
    return { success: true }
  },

  /**
   * @param {StadiumType} stadium
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updatePrices (stadium, req) {
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== stadium.id) throw new UnauthorizedError('Not your stadium dude')
    const stands = ['north', 'south', 'east', 'west']
    for (const stand of stands) {
      const val = stadium[stand + '_stand_price']
      if (!Number.isInteger(val) || val <= 0 || val > 100) throw new BadRequestError('Price needs to be a integer number greater than 0 and less than 100.')
    }
    await query(`UPDATE stadium
        SET ${stands.map(n => n + '_stand_price=?').join(', ')}
        WHERE id=?`, stands.map(n => stadium[n + '_stand_price']).concat([stadium.id]))
    console.log('Updated stadium prices')
    return { success: true }
  }
}
