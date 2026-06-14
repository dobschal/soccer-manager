import { getTeam } from '../helper/teamHelper.js'
import { getBuildingsForTeam, getBuildingConstructionInfo, upgradeBuilding, BUILDING_UPGRADES, TRAINING_AREA_CARD_CHANCES, FITNESS_STUDIO_CARD_CHANCES, YOUTH_ACADEMY_CARD_CHANCES } from '../helper/buildingHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { updateTeamBalance } from '../helper/financeHelper.js'
import { BadRequestError } from '../lib/errors.js'
import { getUserLocale, t } from '../i18n/index.js'
import { advanceTutorialIfStep, getTutorialStep, TUTORIAL_STEPS } from '../helper/tutorialHelper.js'

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
      youthAcademyCardChances: YOUTH_ACADEMY_CARD_CHANCES
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

    const tutorialStep = await getTutorialStep(req.user.id)
    const tutorialDiscount = (
      buildingType === 'youth_academy' &&
      tutorialStep === TUTORIAL_STEPS.UPGRADE_YOUTH_ACADEMY
    )

    // Look up the current level so we know what we're refunding if the
    // tutorial discount applies. Reads same row as upgradeBuilding will,
    // but ahead of the deduction.
    let cost = 0
    if (tutorialDiscount) {
      const buildings = await getBuildingsForTeam(team.id)
      const academy = buildings.find(b => b.type === 'youth_academy')
      const targetLevel = (academy?.level ?? 1) + 1
      cost = BUILDING_UPGRADES[`youth_academy_${targetLevel}`]?.cost ?? 0
    }

    const result = await upgradeBuilding(team, buildingType, locale)
    if (buildingType === 'youth_academy') {
      await advanceTutorialIfStep(req.user.id, TUTORIAL_STEPS.UPGRADE_YOUTH_ACADEMY, TUTORIAL_STEPS.PLAY_NEW_YOUTH_CARD)
    }

    if (tutorialDiscount && cost > 0) {
      const { gameDay, season } = await getGameDayAndSeason()
      const reason = t('finance.tutorialRefund', {}, locale)
      await updateTeamBalance(team, cost, reason, gameDay, season)
    }
    return result
  }
}
