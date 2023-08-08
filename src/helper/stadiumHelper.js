import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { updateTeamBalance } from './financeHelpr.js'
import { getTeam } from './teamhelper.js'

/**
 * @param {Request} req
 * @returns {Promise<StadiumType>}
 */
export async function getStadiumOfCurrentUser (req) {
  const team = await getTeam(req)
  const [stadium] = await query('SELECT * FROM stadium WHERE team_id=? LIMIT 1', [team.id])
  return stadium
}

/**
 * 500 neue sitze --> 100 000
 * 5000 --> 1 000 000
 *
 * @param {StadiumType} currentStadium
 * @param {StadiumType} plannedStadium
 * @returns {number}
 */
export function calcuateStadiumBuild (currentStadium, plannedStadium) {
  const standNames = ['north', 'south', 'west', 'east']
  let totalPrice = 0
  for (const standName of standNames) {
    const currentStandSize = currentStadium[standName + '_stand_size']
    const planneStandSize = plannedStadium[standName + '_stand_size']
    if (planneStandSize > 40000) throw new BadRequestError('Maximum allowed stand size is 40 000.')
    const seatsDiff = Math.floor(planneStandSize - currentStandSize)
    if (seatsDiff < 0) throw new BadRequestError('You cannot deconstruct the stand...')
    const priceForSeats = seatsDiff * 200
    /*const isLevelUpToMid = planneStandSize >= 4000 && currentStandSize < 4000
    const isLevelUpToBig = planneStandSize >= 10000 && currentStandSize < 10000*/
    let standPrice = priceForSeats
    if (seatsDiff > 10000) standPrice += 5000000
    else if (seatsDiff > 5000) standPrice += 1000000
    else if (seatsDiff > 0) standPrice += 100000
    if (currentStadium[standName + '_stand_roof'] && !plannedStadium[standName + '_stand_roof']) {
      throw new BadRequestError('Roof cannot be removed')
    }
    if (!currentStadium[standName + '_stand_roof'] && plannedStadium[standName + '_stand_roof']) {
      standPrice = standPrice * 1.3
    }
    totalPrice += standPrice
  }
  return totalPrice
}

/**
 * @param {TeamType} team
 * @param {StadiumType} plannedStadium
 * @param {number} price
 * @returns {Promise<void>}
 */
export async function buildStadium (team, plannedStadium, price) {
  const { gameDay, season } = await getGameDayAndSeason()
  await updateTeamBalance(team, price * -1, 'Stadium construction build', gameDay, season)
  await query(`
        UPDATE stadium SET north_stand_size=?, 
                           south_stand_size=?, 
                           west_stand_size=?, 
                           east_stand_size=?,
                           north_stand_roof=?,
                           south_stand_roof=?,
                           west_stand_roof=?,
                           east_stand_roof=? WHERE id=?
    `, [
    plannedStadium.north_stand_size,
    plannedStadium.south_stand_size,
    plannedStadium.west_stand_size,
    plannedStadium.east_stand_size,
    plannedStadium.north_stand_roof,
    plannedStadium.south_stand_roof,
    plannedStadium.west_stand_roof,
    plannedStadium.east_stand_roof,
    plannedStadium.id
  ])
}
