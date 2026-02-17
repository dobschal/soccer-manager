import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { updateTeamBalance } from './financeHelper.js'
import { addLogMessage } from './logMessageHelper.js'
import { getUserLocale, t } from '../i18n/index.js'
import { calculateConstructionEndDate } from './stadiumHelper.js'

const GAMEDAYS_PER_SEASON = 34

/**
 * Upgrade costs and construction times per building type and target level.
 * Key format: `${type}_${targetLevel}`
 */
export const BUILDING_UPGRADES = {
  training_area_1: { cost: 500_000, constructionDays: 5 },
  training_area_2: { cost: 1_500_000, constructionDays: 10 },
  training_area_3: { cost: 4_000_000, constructionDays: 17 }
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
 * Get construction info for a building
 * @param {BuildingType} building
 * @param {number} currentGameDay
 * @param {number} currentSeason
 * @returns {{underConstruction: boolean, remainingGameDays?: number, endGameDay?: number, endSeason?: number, targetLevel?: number}}
 */
export function getBuildingConstructionInfo (building, currentGameDay, currentSeason) {
  if (building.construction_end_game_day === null || building.construction_end_game_day === undefined) {
    return { underConstruction: false }
  }

  const currentTotal = currentSeason * GAMEDAYS_PER_SEASON + currentGameDay
  const endTotal = building.construction_end_season * GAMEDAYS_PER_SEASON + building.construction_end_game_day
  const remaining = Math.max(0, endTotal - currentTotal)

  return {
    underConstruction: true,
    remainingGameDays: remaining,
    endGameDay: building.construction_end_game_day,
    endSeason: building.construction_end_season,
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

  const { endGameDay, endSeason } = calculateConstructionEndDate(gameDay, season, upgrade.constructionDays)

  const reason = t('finance.buildingUpgrade', {}, locale)
  await updateTeamBalance(team, upgrade.cost * -1, reason, gameDay, season)

  await query(
    'UPDATE building SET construction_end_game_day=?, construction_end_season=?, construction_target_level=? WHERE id=?',
    [endGameDay, endSeason, targetLevel, building.id]
  )

  await addLogMessage(
    t('log.buildingUpgradeStarted', { buildingName: t('building.trainingArea', {}, locale) }, locale),
    team,
    null,
    null,
    'building'
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
      await addLogMessage(
        t('log.buildingUpgradeComplete', { buildingName: t('building.trainingArea', {}, locale) }, locale),
        team,
        null,
        null,
        'building'
      )
    }
  }
}
