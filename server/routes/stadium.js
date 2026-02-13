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
import { t } from '../i18n/index.js'

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
    const locale = req.locale || 'en'
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== stadium.id) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))

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
            message: t('error.standUnderConstruction', {}, locale)
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
    const locale = req.locale || 'en'
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== stadium.id) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))

    // Validate no stands being expanded are under construction
    const stands = ['north', 'south', 'east', 'west']
    for (const stand of stands) {
      const hasChanges = currentStadium[`${stand}_stand_size`] !== stadium[`${stand}_stand_size`] ||
                         currentStadium[`${stand}_stand_roof`] !== stadium[`${stand}_stand_roof`]

      if (hasChanges && isStandUnderConstruction(currentStadium, stand)) {
        throw new BadRequestError(t('error.standUnderConstruction', {}, locale))
      }
    }

    const price = calcuateStadiumBuild(currentStadium, stadium)
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    if (team.balance < price) throw new BadRequestError(t('error.notEnoughMoney', {}, locale))
    const result = await buildStadium(team, currentStadium, stadium, price)
    return { success: true, constructionInfo: result.constructionInfo }
  },

  /**
   * @param {Request} req
   * @returns {Promise<{attendance: Array}>}
   */
  async getStadiumAttendance (req) {
    const stadium = await getStadiumOfCurrentUser(req)
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const games = await query(
      "SELECT * FROM game WHERE team_1_id=? AND played=1 AND game_type='league' ORDER BY season DESC, game_day DESC LIMIT 5",
      [team.id]
    )

    const stands = ['north', 'south', 'east', 'west']
    const attendance = games.map(game => {
      const details = JSON.parse(game.details || '{}')
      const sd = details.stadiumDetails || {}
      const row = { season: game.season, gameDay: game.game_day, stands: {} }
      for (const stand of stands) {
        const guests = sd[stand + 'Guests'] || 0
        const size = stadium[stand + '_stand_size'] || 1
        row.stands[stand] = { guests, size, percentage: Math.round((guests / size) * 100) }
      }
      return row
    })

    return { attendance }
  },

  /**
   * @param {Request} req
   * @returns {Promise<{history: Array}>}
   */
  async getConstructionHistory (req) {
    const stadium = await getStadiumOfCurrentUser(req)
    const history = await query(
      'SELECT * FROM stadium_construction_history WHERE stadium_id=? ORDER BY created_at DESC',
      [stadium.id]
    )
    return { history }
  },

  /**
   * @param {StadiumType} stadium
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updatePrices (stadium, req) {
    const locale = req.locale || 'en'
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== stadium.id) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const stands = ['north', 'south', 'east', 'west']
    for (const stand of stands) {
      const val = stadium[stand + '_stand_price']
      if (!Number.isInteger(val) || val <= 0 || val > 100) throw new BadRequestError(t('error.invalidTicketPrice', {}, locale))
    }
    await query(`UPDATE stadium
        SET ${stands.map(n => n + '_stand_price=?').join(', ')}
        WHERE id=?`, stands.map(n => stadium[n + '_stand_price']).concat([stadium.id]))
    console.log('Updated stadium prices')
    return { success: true }
  }
}
