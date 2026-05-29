import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getGameDayAndSeason, getSeasonGameDayCount } from './gameDayHelper.js'
import { updateTeamBalance } from './financeHelper.js'
import { addLogMessage } from './logMessageHelper.js'
import { getUserLocale, t } from '../i18n/index.js'
import { calculateConstructionEndDate } from './stadiumHelper.js'

/**
 * Upgrade costs and construction times per building type and target level.
 * Key format: `${type}_${targetLevel}`
 */
export const BUILDING_UPGRADES = {
  training_area_1: { cost: 375_000, constructionDays: 5 },
  training_area_2: { cost: 1_125_000, constructionDays: 10 },
  training_area_3: { cost: 3_000_000, constructionDays: 17 },
  fitness_studio_1: { cost: 300_000, constructionDays: 4 },
  fitness_studio_2: { cost: 900_000, constructionDays: 8 },
  fitness_studio_3: { cost: 2_625_000, constructionDays: 15 },
  youth_academy_1: { cost: 1_000_000, constructionDays: 5 },
  youth_academy_2: { cost: 3_000_000, constructionDays: 10 },
  youth_academy_3: { cost: 9_000_000, constructionDays: 17 }
}

/**
 * Action card chances per game day, keyed by training area level.
 * Only LEVEL_UP cards are affected; other cards use global defaults.
 */
export const TRAINING_AREA_CARD_CHANCES = {
  0: { LEVEL_UP_PLAYER_40: 0.2, LEVEL_UP_PLAYER_70: 0, LEVEL_UP_PLAYER_100: 0 },
  1: { LEVEL_UP_PLAYER_40: 1.2, LEVEL_UP_PLAYER_70: 0, LEVEL_UP_PLAYER_100: 0 },
  2: { LEVEL_UP_PLAYER_40: 1.2, LEVEL_UP_PLAYER_70: 0.3, LEVEL_UP_PLAYER_100: 0 },
  3: { LEVEL_UP_PLAYER_40: 1.2, LEVEL_UP_PLAYER_70: 0.3, LEVEL_UP_PLAYER_100: 0.06 }
}

/**
 * Action card chances per game day, keyed by fitness studio level.
 * Only FRESHNESS cards are affected; other cards use global defaults.
 */
export const FITNESS_STUDIO_CARD_CHANCES = {
  0: { FRESHNESS_5: 0, FRESHNESS_10: 0.5, FRESHNESS_20: 0 },
  1: { FRESHNESS_5: 0.6, FRESHNESS_10: 0.88, FRESHNESS_20: 0 },
  2: { FRESHNESS_5: 0.6, FRESHNESS_10: 0.88, FRESHNESS_20: 0.15 },
  3: { FRESHNESS_5: 0.6, FRESHNESS_10: 0.88, FRESHNESS_20: 0.3 }
}

/**
 * Action card chances per game day, keyed by youth academy level.
 * Only NEW_YOUTH_PLAYER_X cards are affected; other cards use global defaults.
 * Target ~1/2/3/4 cards per season (34 game days) for levels 0/1/2/3.
 */
export const YOUTH_ACADEMY_CARD_CHANCES = {
  0: { NEW_YOUTH_PLAYER_1: 0.03, NEW_YOUTH_PLAYER_2: 0, NEW_YOUTH_PLAYER_3: 0 },
  1: { NEW_YOUTH_PLAYER_1: 0.06, NEW_YOUTH_PLAYER_2: 0, NEW_YOUTH_PLAYER_3: 0 },
  2: { NEW_YOUTH_PLAYER_1: 0.06, NEW_YOUTH_PLAYER_2: 0.03, NEW_YOUTH_PLAYER_3: 0 },
  3: { NEW_YOUTH_PLAYER_1: 0.06, NEW_YOUTH_PLAYER_2: 0.03, NEW_YOUTH_PLAYER_3: 0.03 }
}

/**
 * Map building type to i18n key for log messages.
 */
const BUILDING_NAME_KEYS = {
  training_area: 'building.trainingArea',
  fitness_studio: 'building.fitnessStudio',
  youth_academy: 'building.youthAcademy'
}

/**
 * @param {number} teamId
 * @returns {Promise<BuildingType[]>}
 */
export async function getBuildingsForTeam (teamId) {
  return await query('SELECT * FROM building WHERE team_id=?', [teamId])
}

/**
 * @param {number} teamId
 * @returns {Promise<number>}
 */
export async function getTrainingAreaLevel (teamId) {
  const [building] = await query(
    "SELECT * FROM building WHERE team_id=? AND type='training_area' LIMIT 1",
    [teamId]
  )
  return building?.level ?? 1
}

/**
 * Batch-fetch training area levels for all teams.
 * Returns a Map of teamId -> level.
 * @returns {Promise<Map<number, number>>}
 */
export async function getAllTrainingAreaLevels () {
  const buildings = await query("SELECT team_id, level FROM building WHERE type='training_area'")
  const map = new Map()
  for (const b of buildings) {
    map.set(b.team_id, b.level)
  }
  return map
}

/**
 * @param {number} teamId
 * @returns {Promise<number>}
 */
export async function getFitnessStudioLevel (teamId) {
  const [building] = await query(
    "SELECT * FROM building WHERE team_id=? AND type='fitness_studio' LIMIT 1",
    [teamId]
  )
  return building?.level ?? 1
}

/**
 * Batch-fetch fitness studio levels for all teams.
 * Returns a Map of teamId -> level.
 * @returns {Promise<Map<number, number>>}
 */
export async function getAllFitnessStudioLevels () {
  const buildings = await query("SELECT team_id, level FROM building WHERE type='fitness_studio'")
  const map = new Map()
  for (const b of buildings) {
    map.set(b.team_id, b.level)
  }
  return map
}

/**
 * @param {number} teamId
 * @returns {Promise<number>}
 */
export async function getYouthAcademyLevel (teamId) {
  const [building] = await query(
    "SELECT * FROM building WHERE team_id=? AND type='youth_academy' LIMIT 1",
    [teamId]
  )
  return building?.level ?? 0
}

/**
 * Batch-fetch youth academy levels for all teams.
 * Returns a Map of teamId -> level.
 * @returns {Promise<Map<number, number>>}
 */
export async function getAllYouthAcademyLevels () {
  const buildings = await query("SELECT team_id, level FROM building WHERE type='youth_academy'")
  const map = new Map()
  for (const b of buildings) {
    map.set(b.team_id, b.level)
  }
  return map
}

/**
 * Get construction info for a building
 * @param {BuildingType} building
 * @param {number} currentGameDay
 * @param {number} currentSeason
 * @returns {Promise<{underConstruction: boolean, remainingGameDays?: number, endGameDay?: number, endSeason?: number, targetLevel?: number}>}
 */
export async function getBuildingConstructionInfo (building, currentGameDay, currentSeason) {
  if (building.construction_end_game_day === null || building.construction_end_game_day === undefined) {
    return { underConstruction: false }
  }

  const endGameDay = building.construction_end_game_day
  const endSeason = building.construction_end_season

  let remaining
  if (endSeason < currentSeason) {
    remaining = 0
  } else if (endSeason === currentSeason) {
    remaining = Math.max(0, endGameDay - currentGameDay)
  } else {
    let total = 0
    let curDay = currentGameDay
    let curSeason = currentSeason
    while (curSeason < endSeason) {
      const seasonMaxDay = await getSeasonGameDayCount(curSeason)
      total += Math.max(0, seasonMaxDay - curDay)
      curSeason++
      curDay = 0
    }
    remaining = total + endGameDay
  }

  return {
    underConstruction: true,
    remainingGameDays: remaining,
    endGameDay,
    endSeason,
    targetLevel: building.construction_target_level
  }
}

/**
 * Start a building upgrade
 * @param {TeamType} team
 * @param {string} buildingType
 * @param {string} locale
 * @returns {Promise<{success: boolean}>}
 */
export async function upgradeBuilding (team, buildingType, locale) {
  const { gameDay, season } = await getGameDayAndSeason()

  const [building] = await query(
    'SELECT * FROM building WHERE team_id=? AND type=? LIMIT 1',
    [team.id, buildingType]
  )

  if (!building) {
    throw new BadRequestError(t('error.buildingNotFound', {}, locale))
  }

  if (building.construction_end_game_day !== null) {
    throw new BadRequestError(t('error.buildingUnderConstruction', {}, locale))
  }

  const targetLevel = building.level + 1
  const upgradeKey = `${buildingType}_${targetLevel}`
  const upgrade = BUILDING_UPGRADES[upgradeKey]

  if (!upgrade) {
    throw new BadRequestError(t('error.buildingMaxLevel', {}, locale))
  }

  if (team.balance < upgrade.cost) {
    throw new BadRequestError(t('error.notEnoughMoney', {}, locale))
  }

  const { endGameDay, endSeason } = await calculateConstructionEndDate(gameDay, season, upgrade.constructionDays)

  const reason = t('finance.buildingUpgrade', {}, locale)
  await updateTeamBalance(team, upgrade.cost * -1, reason, gameDay, season)

  await query(
    'UPDATE building SET construction_end_game_day=?, construction_end_season=?, construction_target_level=? WHERE id=?',
    [endGameDay, endSeason, targetLevel, building.id]
  )

  const buildingNameKey = BUILDING_NAME_KEYS[buildingType] || buildingType
  await addLogMessage(
    t('log.buildingUpgradeStarted', { buildingName: t(buildingNameKey, {}, locale) }, locale),
    team,
    null,
    null,
    'building',
    undefined,
    'info'
  )

  return { success: true }
}

/**
 * Complete any building constructions that are due
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function completeBuildingConstructions (gameDay, season) {
  const buildings = await query(`
    SELECT b.*, t.id as team_id_ref, t.name as team_name, t.user_id
    FROM building b
    JOIN team t ON b.team_id = t.id
    WHERE b.construction_end_game_day IS NOT NULL
      AND (b.construction_end_season < ?
        OR (b.construction_end_season = ? AND b.construction_end_game_day <= ?))
  `, [season, season, gameDay])

  for (const building of buildings) {
    await query(
      'UPDATE building SET level=?, construction_end_game_day=NULL, construction_end_season=NULL, construction_target_level=NULL WHERE id=?',
      [building.construction_target_level, building.id]
    )

    const [team] = await query('SELECT * FROM team WHERE id=?', [building.team_id])
    if (team) {
      const locale = await getUserLocale(team.user_id)
      const buildingNameKey = BUILDING_NAME_KEYS[building.type] || building.type
      await addLogMessage(
        t('log.buildingUpgradeComplete', { buildingName: t(buildingNameKey, {}, locale) }, locale),
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
