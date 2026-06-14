import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 5, season: 1 })
}))

vi.mock('../../helper/buildingHelper.js', () => ({
  getBuildingsForTeam: vi.fn(),
  getBuildingConstructionInfo: vi.fn(),
  upgradeBuilding: vi.fn(),
  BUILDING_UPGRADES: {
    training_area_1: { cost: 500_000, constructionDays: 5 },
    training_area_2: { cost: 1_500_000, constructionDays: 10 },
    training_area_3: { cost: 4_000_000, constructionDays: 17 },
    fitness_studio_1: { cost: 400_000, constructionDays: 4 },
    fitness_studio_2: { cost: 1_200_000, constructionDays: 8 },
    fitness_studio_3: { cost: 3_500_000, constructionDays: 15 },
    youth_academy_2: { cost: 3_000_000, constructionDays: 10 },
    youth_academy_3: { cost: 9_000_000, constructionDays: 17 }
  },
  TRAINING_AREA_CARD_CHANCES: {
    0: { LEVEL_UP_PLAYER_40: 0.2, LEVEL_UP_PLAYER_70: 0, LEVEL_UP_PLAYER_100: 0 },
    1: { LEVEL_UP_PLAYER_40: 1.2, LEVEL_UP_PLAYER_70: 0, LEVEL_UP_PLAYER_100: 0 },
    2: { LEVEL_UP_PLAYER_40: 1.2, LEVEL_UP_PLAYER_70: 0.3, LEVEL_UP_PLAYER_100: 0 },
    3: { LEVEL_UP_PLAYER_40: 1.2, LEVEL_UP_PLAYER_70: 0.3, LEVEL_UP_PLAYER_100: 0.06 }
  },
  FITNESS_STUDIO_CARD_CHANCES: {
    0: { FRESHNESS_5: 0, FRESHNESS_10: 0.5, FRESHNESS_20: 0 },
    1: { FRESHNESS_5: 0.6, FRESHNESS_10: 0.88, FRESHNESS_20: 0 },
    2: { FRESHNESS_5: 0.6, FRESHNESS_10: 0.88, FRESHNESS_20: 0.15 },
    3: { FRESHNESS_5: 0.6, FRESHNESS_10: 0.88, FRESHNESS_20: 0.3 }
  },
  YOUTH_ACADEMY_CARD_CHANCES: {
    1: { NEW_YOUTH_PLAYER_1: 0.06, NEW_YOUTH_PLAYER_2: 0, NEW_YOUTH_PLAYER_3: 0 },
    2: { NEW_YOUTH_PLAYER_1: 0.06, NEW_YOUTH_PLAYER_2: 0.03, NEW_YOUTH_PLAYER_3: 0 },
    3: { NEW_YOUTH_PLAYER_1: 0.06, NEW_YOUTH_PLAYER_2: 0.03, NEW_YOUTH_PLAYER_3: 0.03 }
  }
}))

vi.mock('../../i18n/index.js', () => ({
  getUserLocale: vi.fn().mockResolvedValue('en'),
  t: vi.fn((key) => key)
}))

vi.mock('../../helper/tutorialHelper.js', () => ({
  advanceTutorialIfStep: vi.fn().mockResolvedValue(false),
  getTutorialStep: vi.fn().mockResolvedValue(99),
  TUTORIAL_STEPS: { UPGRADE_YOUTH_ACADEMY: 3, PLAY_NEW_YOUTH_CARD: 4 }
}))

vi.mock('../../helper/financeHelper.js', () => ({
  updateTeamBalance: vi.fn().mockResolvedValue()
}))

import { getTeam } from '../../helper/teamHelper.js'
import { getBuildingsForTeam, getBuildingConstructionInfo, upgradeBuilding } from '../../helper/buildingHelper.js'
import handlers from '../../routes/buildings.js'

describe('buildings routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getBuildings', () => {
    it('returns buildings with construction info', async () => {
      const team = testData.team()
      const building = testData.building()

      getTeam.mockResolvedValue(team)
      getBuildingsForTeam.mockResolvedValue([building])
      getBuildingConstructionInfo.mockReturnValue({ underConstruction: false })

      const req = createMockRequest()
      const result = await handlers.getBuildings(req)

      expect(result.buildings).toHaveLength(1)
      expect(result.buildings[0].constructionInfo).toEqual({ underConstruction: false })
      expect(result.upgrades).toBeDefined()
      expect(result.cardChances).toBeDefined()
      expect(result.fitnessCardChances).toBeDefined()
    })

    it('returns empty array when no buildings', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      getBuildingsForTeam.mockResolvedValue([])

      const req = createMockRequest()
      const result = await handlers.getBuildings(req)

      expect(result.buildings).toHaveLength(0)
    })
  })

  describe('upgradeBuilding', () => {
    it('calls upgradeBuilding helper with correct params', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      upgradeBuilding.mockResolvedValue({ success: true })

      const req = createMockRequest()
      const result = await handlers.upgradeBuilding('training_area', req)

      expect(result.success).toBe(true)
      expect(upgradeBuilding).toHaveBeenCalledWith(team, 'training_area', 'en')
    })

    it('throws on invalid building type', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.upgradeBuilding(null, req)).rejects.toThrow()
    })

    it('throws on empty string building type', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.upgradeBuilding('', req)).rejects.toThrow()
    })
  })
})
