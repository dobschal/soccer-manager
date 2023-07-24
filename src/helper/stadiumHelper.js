import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'

/**
 * @param {import("express").Request} req
 * @returns {Promise<import("../entities/stadium.js").StadiumType>}
 */
export async function getStadiumOfCurrentUser (req) {
  const [team] = await query('SELECT * FROM team WHERE user_id=?', [req.user.id])
  const [stadium] = await query('SELECT * FROM stadium WHERE team_id=? LIMIT 1', [team.id])
  return stadium
}

/**
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
    const seatsDiff = planneStandSize - currentStandSize
    if (seatsDiff < 0) throw new BadRequestError('You cannot deconstruct the stand...')
    const priceForSeats = seatsDiff * 15
    const isLevelUpToMid = planneStandSize >= 5000 && currentStandSize < 5000
    const isLevelUpToBig = planneStandSize >= 20000 && currentStandSize < 20000
    let standPrice = priceForSeats
    if (isLevelUpToMid) standPrice += 1000000
    else if (isLevelUpToBig) standPrice += 10000000
    else standPrice += 100000
    if (currentStadium[standName + '_stand_roof'] && !plannedStadium[standName + '_stand_roof']) {
      throw new BadRequestError('Roof cannot be removed')
    }
    if (!currentStadium[standName + '_stand_roof'] && plannedStadium[standName + '_stand_roof']) {
      standPrice = standPrice * 1.2
    }
    totalPrice += standPrice
  }
  return totalPrice
}
