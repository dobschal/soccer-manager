import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { updateTeamBalance } from './financeHelper.js'
import { getTeam } from './teamHelper.js'
import { addLogMessage } from './logMessageHelper.js'
import { getUserLocale, t } from '../i18n/index.js'

const GAMEDAYS_PER_SEASON = 34

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
 * Calculates construction time in gamedays for a stand expansion
 * @param {number} currentSize - Current stand size
 * @param {number} targetSize - Target stand size
 * @param {boolean|number} currentRoof - Current roof status
 * @param {boolean|number} targetRoof - Target roof status
 * @returns {number} Construction time in gamedays
 */
export function calculateConstructionTime (currentSize, targetSize, currentRoof, targetRoof) {
  const seatsDiff = targetSize - currentSize
  const baseTime = Math.max(3, Math.ceil(seatsDiff / 1000))
  const addingRoof = !currentRoof && targetRoof
  const roofTime = addingRoof ? 3 : 0
  return baseTime + roofTime
}

/**
 * Calculates the end gameday and season for construction
 * @param {number} gameDay - Current gameday
 * @param {number} season - Current season
 * @param {number} constructionDays - Number of gamedays for construction
 * @returns {{endGameDay: number, endSeason: number}}
 */
export function calculateConstructionEndDate (gameDay, season, constructionDays) {
  let endGameDay = gameDay + constructionDays
  let endSeason = season

  while (endGameDay > GAMEDAYS_PER_SEASON) {
    endGameDay -= GAMEDAYS_PER_SEASON
    endSeason++
  }

  return {
    endGameDay,
    endSeason
  }
}

/**
 * Checks if a stand is currently under construction
 * @param {StadiumType} stadium
 * @param {string} standName - 'north', 'south', 'east', or 'west'
 * @returns {boolean}
 */
export function isStandUnderConstruction (stadium, standName) {
  const endGameDay = stadium[`${standName}_construction_end_game_day`]
  return endGameDay != null
}

/**
 * Gets construction info for all stands
 * @param {StadiumType} stadium
 * @param {number} currentGameDay
 * @param {number} currentSeason
 * @returns {Object} Construction info per stand
 */
export function getConstructionInfo (stadium, currentGameDay, currentSeason) {
  const stands = ['north', 'south', 'east', 'west']
  const info = {}

  for (const stand of stands) {
    const endGameDay = stadium[`${stand}_construction_end_game_day`]
    const endSeason = stadium[`${stand}_construction_end_season`]

    if (endGameDay === null || endGameDay === undefined) {
      info[stand] = { underConstruction: false }
    } else {
      const currentTotal = currentSeason * GAMEDAYS_PER_SEASON + currentGameDay
      const endTotal = endSeason * GAMEDAYS_PER_SEASON + endGameDay
      const remaining = endTotal - currentTotal

      // If remaining days <= 0, construction is complete
      if (remaining <= 0) {
        info[stand] = { underConstruction: false }
      } else {
        info[stand] = {
          underConstruction: true,
          remainingGameDays: remaining,
          endGameDay,
          endSeason,
          targetSize: stadium[`${stand}_construction_target_size`],
          targetRoof: stadium[`${stand}_construction_target_roof`]
        }
      }
    }
  }

  return info
}

/**
 * Completes any stadium constructions that are due
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function completeStadiumConstructions (gameDay, season) {
  const stands = ['north', 'south', 'east', 'west']

  for (const stand of stands) {
    const stadiums = await query(`
        SELECT s.*, t.id as team_id_ref, t.name as team_name
        FROM stadium s
                 JOIN team t ON s.team_id = t.id
        WHERE s.${stand}_construction_end_game_day IS NOT NULL
          AND (s.${stand}_construction_end_season < ?
            OR (s.${stand}_construction_end_season = ? AND s.${stand}_construction_end_game_day <= ?))
    `, [season, season, gameDay])

    for (const stadium of stadiums) {
      await query(`
          UPDATE stadium
          SET ${stand}_stand_size                = ${stand}_construction_target_size,
              ${stand}_stand_roof                = ${stand}_construction_target_roof,
              ${stand}_construction_end_game_day = NULL,
              ${stand}_construction_end_season   = NULL,
              ${stand}_construction_target_size  = NULL,
              ${stand}_construction_target_roof  = NULL
          WHERE id = ?
      `, [stadium.id])

      const [team] = await query('SELECT * FROM team WHERE id=?', [stadium.team_id])
      if (team) {
        await addLogMessage(`Your ${stand} stand construction is complete!`, team, null, null, 'building')
      }
    }
  }
}

/**
 * @param {StadiumType} currentStadium
 * @param {StadiumType} plannedStadium
 * @returns {number}
 */
export function calcuateStadiumBuild (currentStadium, plannedStadium) {
  // Stand size limits: north/south are larger (behind goals), east/west are smaller (sidelines)
  const standLimits = {
    north: {
      min: 200,
      max: 30_000
    },
    south: {
      min: 200,
      max: 30_000
    },
    east: {
      min: 100,
      max: 15_000
    },
    west: {
      min: 100,
      max: 15_000
    }
  }

  let totalPrice = 0
  for (const standName of Object.keys(standLimits)) {
    const currentStandSize = currentStadium[standName + '_stand_size']
    const plannedStandSize = plannedStadium[standName + '_stand_size']
    const {
      min,
      max
    } = standLimits[standName]

    if (plannedStandSize < min) {
      throw new BadRequestError(`Minimum size for ${standName} stand is ${min.toLocaleString()} seats.`)
    }
    if (plannedStandSize > max) {
      throw new BadRequestError(`Maximum size for ${standName} stand is ${max.toLocaleString()} seats.`)
    }

    const seatsDiff = Math.floor(plannedStandSize - currentStandSize)
    if (seatsDiff < 0) throw new BadRequestError('You cannot deconstruct the stand...')
    if (seatsDiff === 0) continue

    // Alianz Arena was 360_000_000 € for 60000 seats
    // --> 6000 per seat incl Roof
    const pricePerSeat = (seatsDiff / 60_000) * 6000
    let standPrice = pricePerSeat * seatsDiff
    if (currentStadium[standName + '_stand_roof'] && !plannedStadium[standName + '_stand_roof']) {
      throw new BadRequestError('Roof cannot be removed')
    }

    // roof price is 20% of stand price with minimum of 300_000 €
    if (!currentStadium[standName + '_stand_roof'] && plannedStadium[standName + '_stand_roof']) {
      standPrice = Math.max(300_000, standPrice * 1.2)
    }
    
    totalPrice += standPrice
  }
  if (totalPrice > 0) totalPrice += 200_000 // costs of architect
  return totalPrice
}

/**
 * @param {TeamType} team
 * @param {StadiumType} currentStadium
 * @param {StadiumType} plannedStadium
 * @param {number} price
 * @returns {Promise<{constructionInfo: Object}>}
 */
export async function buildStadium (team, currentStadium, plannedStadium, price) {
  const {
    gameDay,
    season
  } = await getGameDayAndSeason()
  const locale = await getUserLocale(team.user_id)
  const reason = t('finance.stadiumConstruction', {}, locale)
  await updateTeamBalance(team, price * -1, reason, gameDay, season)

  const stands = ['north', 'south', 'east', 'west']
  const updateFields = {}

  for (const stand of stands) {
    const currentSize = currentStadium[`${stand}_stand_size`]
    const targetSize = plannedStadium[`${stand}_stand_size`]
    const currentRoof = currentStadium[`${stand}_stand_roof`]
    const targetRoof = plannedStadium[`${stand}_stand_roof`]

    // Skip if no changes for this stand
    if (currentSize === targetSize && currentRoof === targetRoof) continue

    // Check if stand is already under construction
    if (isStandUnderConstruction(currentStadium, stand)) {
      throw new BadRequestError(`${stand} stand is already under construction`)
    }

    const constructionDays = calculateConstructionTime(currentSize, targetSize, currentRoof, targetRoof)
    const {
      endGameDay,
      endSeason
    } = calculateConstructionEndDate(gameDay, season, constructionDays)

    updateFields[`${stand}_construction_end_game_day`] = endGameDay
    updateFields[`${stand}_construction_end_season`] = endSeason
    updateFields[`${stand}_construction_target_size`] = targetSize
    updateFields[`${stand}_construction_target_roof`] = targetRoof ? 1 : 0
  }

  if (Object.keys(updateFields).length === 0) {
    throw new BadRequestError('No changes to build')
  }

  // Build the dynamic UPDATE query
  const setClauses = Object.keys(updateFields).map(k => `${k}=?`).join(', ')
  const values = [...Object.values(updateFields), currentStadium.id]

  await query(`UPDATE stadium
               SET ${setClauses}
               WHERE id = ?`, values)
  await addLogMessage('Construction has started on your stadium!', team, null, null, 'building')

  // Return updated construction info
  const updatedStadium = { ...currentStadium, ...updateFields }
  return { constructionInfo: getConstructionInfo(updatedStadium, gameDay, season) }
}
