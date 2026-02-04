import {
  buildStadium,
  calcuateStadiumBuild,
  getStadiumOfCurrentUser,
  getConstructionInfo,
  isStandUnderConstruction,
  calculateConstructionTime
} from '../helper/stadiumHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
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
   * @returns {Promise<{stadium: StadiumType, constructionInfo: Object}>}
   */
  async getStadium (req) {
    const stadium = await getStadiumOfCurrentUser(req)
    const { gameDay, season } = await getGameDayAndSeason()
    const constructionInfo = getConstructionInfo(stadium, gameDay, season)
    return { stadium, constructionInfo }
  },

  /**
   * @param {StadiumType} stadium
   * @param {Request} req
   * @returns {Promise<{totalPrice: number, constructionTimes: Object}>}
   */
  async calculateStadiumPrice (stadium, req) {
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== stadium.id) throw new UnauthorizedError('Not your stadium dude')

    const stands = ['north', 'south', 'east', 'west']
    const constructionTimes = {}

    for (const stand of stands) {
      const currentSize = currentStadium[`${stand}_stand_size`]
      const targetSize = stadium[`${stand}_stand_size`]
      const currentRoof = currentStadium[`${stand}_stand_roof`]
      const targetRoof = stadium[`${stand}_stand_roof`]

      if (currentSize !== targetSize || currentRoof !== targetRoof) {
        if (isStandUnderConstruction(currentStadium, stand)) {
          constructionTimes[stand] = {
            blocked: true,
            message: 'Already under construction'
          }
        } else {
          constructionTimes[stand] = {
            days: calculateConstructionTime(currentSize, targetSize, currentRoof, targetRoof),
            seatsDiff: targetSize - currentSize,
            addingRoof: !currentRoof && targetRoof
          }
        }
      }
    }

    return {
      totalPrice: calcuateStadiumBuild(currentStadium, stadium),
      constructionTimes
    }
  },

  /**
   * @param {StadiumType} stadium
   * @param {Request} req
   * @returns {Promise<{success: boolean, constructionInfo: Object}>}
   */
  async buildStadium (stadium, req) {
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== stadium.id) throw new UnauthorizedError('Not your stadium dude')

    // Validate no stands being expanded are under construction
    const stands = ['north', 'south', 'east', 'west']
    for (const stand of stands) {
      const hasChanges = currentStadium[`${stand}_stand_size`] !== stadium[`${stand}_stand_size`] ||
                         currentStadium[`${stand}_stand_roof`] !== stadium[`${stand}_stand_roof`]

      if (hasChanges && isStandUnderConstruction(currentStadium, stand)) {
        throw new BadRequestError(`Cannot expand ${stand} stand - already under construction`)
      }
    }

    const price = calcuateStadiumBuild(currentStadium, stadium)
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    if (team.balance < price) throw new BadRequestError('Not enough money...')
    const result = await buildStadium(team, currentStadium, stadium, price)
    return { success: true, constructionInfo: result.constructionInfo }
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
