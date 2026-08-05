import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getGameDayAndSeason, getSeasonGameDayCount } from './gameDayHelper.js'
import { updateTeamBalance } from './financeHelper.js'
import { getTeam } from './teamHelper.js'
import { addLogMessage } from './logMessageHelper.js'
import { getUserLocale, t } from '../i18n/index.js'
import { cityNames } from '../lib/name-library.js'

const _cityNameSet = new Set(cityNames)

/**
 * Roof pricing. A new roof covers the whole stand and therefore lifts the
 * stand's build cost by `ROOF_PRICE_FACTOR` (at least `ROOF_PRICE_MIN`).
 * Keeping the roof while a stand grows only needs the cover extended over the
 * newly added seats, which is charged on top of those seats' price.
 */
const ROOF_PRICE_MIN = 300_000
const ROOF_PRICE_FACTOR = 1.2
const ROOF_EXTENSION_PRICE_MIN = 100_000
const ROOF_EXTENSION_PRICE_FACTOR = 0.2

/**
 * Generate a default stadium name from a team name. The team name follows
 * the pattern "[prefix1] [prefix2] cityName" — we look for a known city in the
 * name and fall back to the last whitespace-separated token.
 * @param {string} teamName
 * @returns {string}
 */
export function defaultStadiumName (teamName) {
  const trimmed = (teamName || '').trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  let city = parts[parts.length - 1] || trimmed || 'Unknown'
  for (const part of parts) {
    if (_cityNameSet.has(part)) {
      city = part
      break
    }
  }
  return `Stadium ${city}`.trim()
}

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
 * Compute the home-team strength modifier based on the actual stadium attendance.
 *
 * Two additive components:
 * - Attendance bonus: linear by absolute attendance, +1% per 6.000 fans, capped at +10% (60.000+ fans).
 * - Fill-rate malus: only when the stadium is below 50% filled, scales linearly from 0 (50% fill)
 *   to -10% (0% fill). Skipped entirely when total capacity is 0 (e.g. no stadium yet).
 *
 * @param {number} totalAttendance - Sum of guests across all stands.
 * @param {number} totalCapacity - Sum of stand sizes (excluding stands under construction).
 * @returns {{ bonusPct: number, multiplier: number, attendanceBonusPct: number, malusPct: number }}
 */
export function calculateHomeAttendanceBonus (totalAttendance, totalCapacity) {
  const attendance = Math.max(0, totalAttendance || 0)
  const capacity = Math.max(0, totalCapacity || 0)
  const attendanceBonusPct = Math.min(10, attendance / 6000)
  let malusPct = 0
  if (capacity > 0) {
    const fillRatePct = (attendance / capacity) * 100
    if (fillRatePct < 50) {
      malusPct = ((50 - fillRatePct) / 50) * 10
    }
  }
  const bonusPct = attendanceBonusPct - malusPct
  return {
    bonusPct,
    multiplier: 1 + (bonusPct / 100),
    attendanceBonusPct,
    malusPct
  }
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
  const baseTime = Math.max(8, Math.ceil(seatsDiff / 300))
  const addingRoof = !currentRoof && targetRoof
  const roofTime = addingRoof ? 6 : 0
  return baseTime + roofTime
}

/**
 * Calculates the end gameday and season for construction. Wraps into the
 * next season(s) when needed, using the actual length of each season
 * (cup rounds make seasons longer than the league-only 34 days).
 *
 * @param {number} gameDay - Current gameday
 * @param {number} season - Current season
 * @param {number} constructionDays - Number of gamedays for construction
 * @returns {Promise<{endGameDay: number, endSeason: number}>}
 */
export async function calculateConstructionEndDate (gameDay, season, constructionDays) {
  let curDay = gameDay
  let curSeason = season
  let remaining = constructionDays

  while (remaining > 0) {
    const seasonMaxDay = await getSeasonGameDayCount(curSeason)
    const daysLeftInSeason = seasonMaxDay - curDay
    if (remaining <= daysLeftInSeason) {
      return { endGameDay: curDay + remaining, endSeason: curSeason }
    }
    remaining -= daysLeftInSeason
    curSeason++
    curDay = 0
  }

  return { endGameDay: curDay, endSeason: curSeason }
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
 * Compute remaining game days between (currentSeason, currentGameDay) and
 * (endSeason, endGameDay), accounting for actual season lengths.
 *
 * @param {number} currentGameDay
 * @param {number} currentSeason
 * @param {number} endGameDay
 * @param {number} endSeason
 * @returns {Promise<number>}
 */
async function _remainingGameDays (currentGameDay, currentSeason, endGameDay, endSeason) {
  if (endSeason < currentSeason) return 0
  if (endSeason === currentSeason) return Math.max(0, endGameDay - currentGameDay)
  let total = 0
  let curDay = currentGameDay
  let curSeason = currentSeason
  while (curSeason < endSeason) {
    const seasonMaxDay = await getSeasonGameDayCount(curSeason)
    total += Math.max(0, seasonMaxDay - curDay)
    curSeason++
    curDay = 0
  }
  total += endGameDay
  return total
}

/**
 * Gets construction info for all stands
 * @param {StadiumType} stadium
 * @param {number} currentGameDay
 * @param {number} currentSeason
 * @returns {Promise<Object>} Construction info per stand
 */
export async function getConstructionInfo (stadium, currentGameDay, currentSeason) {
  const stands = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
  const info = {}

  for (const stand of stands) {
    const endGameDay = stadium[`${stand}_construction_end_game_day`]
    const endSeason = stadium[`${stand}_construction_end_season`]

    if (endGameDay === null || endGameDay === undefined) {
      info[stand] = { underConstruction: false }
    } else {
      const remaining = await _remainingGameDays(currentGameDay, currentSeason, endGameDay, endSeason)

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

  return info
}

/**
 * Completes any stadium constructions that are due
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function completeStadiumConstructions (gameDay, season) {
  const stands = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']

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
      const newSize = stadium[`${stand}_construction_target_size`]

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

      // Mark construction history as completed
      await query(`
          UPDATE stadium_construction_history
          SET completed_game_day = ?, completed_season = ?
          WHERE stadium_id = ? AND stand = ? AND completed_game_day IS NULL
      `, [gameDay, season, stadium.id, stand])

      const [team] = await query('SELECT * FROM team WHERE id=?', [stadium.team_id])
      if (team) {
        const locale = await getUserLocale(team.user_id)
        await addLogMessage(
          t('log.stadiumExpansionComplete', {
            stand: t(`stand.${stand}`, {}, locale),
            newSize
          }, locale),
          team,
          null,
          null,
          'building',
          undefined,
          'success'
        )
      }
    }
  }
}

/**
 * Instantly finalizes any active stand construction for the given team.
 * Used when a user takes over a free team — they shouldn't inherit an
 * in-progress expansion. Silent (no log message).
 * @param {number} teamId
 * @param {number} gameDay - used as completed_game_day in history
 * @param {number} season - used as completed_season in history
 * @returns {Promise<void>}
 */
export async function completeAllStadiumConstructionsForTeam (teamId, gameDay, season) {
  const [stadium] = await query('SELECT * FROM stadium WHERE team_id=? LIMIT 1', [teamId])
  if (!stadium) return
  const stands = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
  for (const stand of stands) {
    if (stadium[`${stand}_construction_end_game_day`] == null) continue
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
    await query(`
        UPDATE stadium_construction_history
        SET completed_game_day = ?, completed_season = ?
        WHERE stadium_id = ? AND stand = ? AND completed_game_day IS NULL
    `, [gameDay, season, stadium.id, stand])
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
    },
    // Corners are the smallest stands, so they get the lowest entry size — a
    // first corner should be affordable long before a full stand is.
    corner_ne: {
      min: 50,
      max: 4_000
    },
    corner_nw: {
      min: 50,
      max: 4_000
    },
    corner_se: {
      min: 50,
      max: 4_000
    },
    corner_sw: {
      min: 50,
      max: 4_000
    }
  }

  let totalPrice = 0
  for (const standName of Object.keys(standLimits)) {
    const currentStandSize = currentStadium[standName + '_stand_size'] ?? 0
    const plannedStandSize = plannedStadium[standName + '_stand_size'] ?? 0
    const currentRoof = Boolean(currentStadium[standName + '_stand_roof'])
    const plannedRoof = Boolean(plannedStadium[standName + '_stand_roof'])
    const {
      min,
      max
    } = standLimits[standName]

    const seatsDiff = Math.floor(plannedStandSize - currentStandSize)
    // Skip untouched stands entirely.
    if (seatsDiff === 0 && currentRoof === plannedRoof) continue

    // Validate the size of every stand that gets seats added — or a roof put on
    // top. Corners start at size 0 (below their minimum), so a stadium that
    // keeps a corner unbuilt and unroofed must not trip the check below.
    if (seatsDiff !== 0 || plannedRoof) {
      if (plannedStandSize < min) {
        throw new BadRequestError(`Minimum size for ${standName} stand is ${min.toLocaleString()} seats.`)
      }
      if (plannedStandSize > max) {
        throw new BadRequestError(`Maximum size for ${standName} stand is ${max.toLocaleString()} seats.`)
      }
    }

    if (seatsDiff < 0) throw new BadRequestError('You cannot deconstruct the stand...')

    let standPrice = calculateSeatExpansionPrice(currentStandSize, plannedStandSize)

    if (!currentRoof && plannedRoof) {
      // A brand new roof spans the whole stand: 20 % on top of the seat price,
      // but never less than ROOF_PRICE_MIN.
      standPrice = Math.max(ROOF_PRICE_MIN, standPrice * ROOF_PRICE_FACTOR)
    } else if (currentRoof && plannedRoof && seatsDiff > 0) {
      // The stand keeps its roof while growing, so the existing roof has to be
      // extended over the added seats — charged on top of those seats.
      standPrice += Math.max(ROOF_EXTENSION_PRICE_MIN, standPrice * ROOF_EXTENSION_PRICE_FACTOR)
    }
    // Tearing a roof down costs nothing — the stand just loses its cover.

    totalPrice += standPrice
  }
  if (totalPrice > 0) totalPrice += 50_000 // costs of architect
  return totalPrice
}

/**
 * Tiered marginal seat pricing — bigger stands cost more per added seat.
 * Brackets are based on the stand's current size (in seats):
 *   - 0 – 2,000:        500 €/seat
 *   - 2,001 – 10,000: 1,000 €/seat
 *   - 10,001 – 20,000: 1,500 €/seat
 *   - 20,001 +:       2,000 €/seat
 *
 * @param {number} currentSize
 * @param {number} plannedSize
 * @returns {number}
 */
export function calculateSeatExpansionPrice (currentSize, plannedSize) {
  const tiers = [
    { upTo: 2_000, pricePerSeat: 500 },
    { upTo: 10_000, pricePerSeat: 1_000 },
    { upTo: 20_000, pricePerSeat: 1_500 },
    { upTo: Infinity, pricePerSeat: 2_000 }
  ]
  let price = 0
  let cursor = currentSize
  for (const { upTo, pricePerSeat } of tiers) {
    if (cursor >= plannedSize) break
    const tierLimit = Math.min(plannedSize, upTo)
    if (cursor < tierLimit) {
      price += (tierLimit - cursor) * pricePerSeat
      cursor = tierLimit
    }
  }
  return price
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

  const stands = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
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
    } = await calculateConstructionEndDate(gameDay, season, constructionDays)

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

  // Record construction history for each changed stand (reuses `stands` above)
  for (const stand of stands) {
    const currentSize = currentStadium[`${stand}_stand_size`]
    const targetSize = plannedStadium[`${stand}_stand_size`]
    const currentRoof = currentStadium[`${stand}_stand_roof`]
    const targetRoof = plannedStadium[`${stand}_stand_roof`]

    if (currentSize === targetSize && currentRoof === targetRoof) continue

    await query('INSERT INTO stadium_construction_history SET ?', {
      stadium_id: currentStadium.id,
      stand,
      old_size: currentSize,
      new_size: targetSize,
      added_roof: (!currentRoof && targetRoof) ? 1 : 0,
      started_game_day: gameDay,
      started_season: season
    })
  }

  await addLogMessage('Construction has started on your stadium!', team, null, null, 'building', undefined, 'info')

  // Return updated construction info
  const updatedStadium = { ...currentStadium, ...updateFields }
  return { constructionInfo: await getConstructionInfo(updatedStadium, gameDay, season) }
}
