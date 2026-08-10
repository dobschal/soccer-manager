import { getTeam } from '../helper/teamHelper.js'
import { getBuildingsForTeam, getBuildingConstructionInfo, upgradeBuilding, BUILDING_UPGRADES, TRAINING_AREA_CARD_CHANCES, FITNESS_STUDIO_CARD_CHANCES, YOUTH_ACADEMY_CARD_CHANCES, MEDICAL_PRACTICE_CARD_CHANCES } from '../helper/buildingHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { BadRequestError } from '../lib/errors.js'
import { getUserLocale, t } from '../i18n/index.js'

export default {

  /**
   * @param {Request} req
   * @returns {Promise<{buildings: Array, upgrades: Object, cardChances: Object}>}
   */
  async getBuildings (req) {
    const team = await getTeam(req)
    const { gameDay, season } = await getGameDayAndSeason()
    const buildings = await getBuildingsForTeam(team.id)

    const buildingsWithInfo = await Promise.all(buildings.map(async b => ({
      ...b,
      constructionInfo: await getBuildingConstructionInfo(b, gameDay, season)
    })))

    return {
      buildings: buildingsWithInfo,
      upgrades: BUILDING_UPGRADES,
      cardChances: TRAINING_AREA_CARD_CHANCES,
      fitnessCardChances: FITNESS_STUDIO_CARD_CHANCES,
      youthAcademyCardChances: YOUTH_ACADEMY_CARD_CHANCES,
      medicalPracticeCardChances: MEDICAL_PRACTICE_CARD_CHANCES
    }
  },

  /**
   * @param {string} buildingType
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async upgradeBuilding (buildingType, req) {
    const team = await getTeam(req)
    const locale = await getUserLocale(req.user.id)

    if (!buildingType || typeof buildingType !== 'string') {
      throw new BadRequestError(t('error.invalidRequest', {}, locale))
    }

    return await upgradeBuilding(team, buildingType, locale)
  }
}
