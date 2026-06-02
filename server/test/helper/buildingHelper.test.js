import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 5, season: 1 }),
  // Default season length used by getBuildingConstructionInfo's cross-season
  // remaining calculation. Tests can override via mockResolvedValueOnce.
  getSeasonGameDayCount: vi.fn().mockResolvedValue(34)
}))

vi.mock('../../helper/financeHelper.js', () => ({
  updateTeamBalance: vi.fn()
}))

vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  getUserLocale: vi.fn().mockResolvedValue('en'),
  t: vi.fn((key) => key)
}))

vi.mock('../../helper/stadiumHelper.js', () => ({
  calculateConstructionEndDate: vi.fn().mockResolvedValue({ endGameDay: 10, endSeason: 1 })
}))

import { query } from '../../lib/database.js'
import { updateTeamBalance } from '../../helper/financeHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import {
  getBuildingConstructionInfo,
  TRAINING_AREA_CARD_CHANCES,
  FITNESS_STUDIO_CARD_CHANCES,
  YOUTH_ACADEMY_CARD_CHANCES,
  BUILDING_UPGRADES,
  upgradeBuilding,
  completeBuildingConstructions,
  getTrainingAreaLevel,
  getAllTrainingAreaLevels,
  getFitnessStudioLevel,
  getAllFitnessStudioLevels,
  getYouthAcademyLevel,
  getAllYouthAcademyLevels,
  getBuildingsForTeam
} from '../../helper/buildingHelper.js'

describe('buildingHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('TRAINING_AREA_CARD_CHANCES', () => {
    it('level 0 has very low bronze, no silver, no gold', () => {
      const chances = TRAINING_AREA_CARD_CHANCES[0]
      expect(chances.LEVEL_UP_PLAYER_40).toBe(0.2)
      expect(chances.LEVEL_UP_PLAYER_70).toBe(0)
      expect(chances.LEVEL_UP_PLAYER_100).toBe(0)
    })

    it('level 1 has normal bronze, no silver, no gold', () => {
      const chances = TRAINING_AREA_CARD_CHANCES[1]
      expect(chances.LEVEL_UP_PLAYER_40).toBe(1.2)
      expect(chances.LEVEL_UP_PLAYER_70).toBe(0)
      expect(chances.LEVEL_UP_PLAYER_100).toBe(0)
    })

    it('level 2 has normal bronze, silver, no gold', () => {
      const chances = TRAINING_AREA_CARD_CHANCES[2]
      expect(chances.LEVEL_UP_PLAYER_40).toBe(1.2)
      expect(chances.LEVEL_UP_PLAYER_70).toBe(0.3)
      expect(chances.LEVEL_UP_PLAYER_100).toBe(0)
    })

    it('level 3 has all three card types', () => {
      const chances = TRAINING_AREA_CARD_CHANCES[3]
      expect(chances.LEVEL_UP_PLAYER_40).toBe(1.2)
      expect(chances.LEVEL_UP_PLAYER_70).toBe(0.3)
      expect(chances.LEVEL_UP_PLAYER_100).toBe(0.06)
    })
  })

  describe('FITNESS_STUDIO_CARD_CHANCES', () => {
    it('level 0 has reduced FRESHNESS_10, no others', () => {
      const chances = FITNESS_STUDIO_CARD_CHANCES[0]
      expect(chances.FRESHNESS_5).toBe(0)
      expect(chances.FRESHNESS_10).toBe(0.5)
      expect(chances.FRESHNESS_20).toBe(0)
    })

    it('level 1 has FRESHNESS_5 and FRESHNESS_10, no FRESHNESS_20', () => {
      const chances = FITNESS_STUDIO_CARD_CHANCES[1]
      expect(chances.FRESHNESS_5).toBe(0.6)
      expect(chances.FRESHNESS_10).toBe(0.88)
      expect(chances.FRESHNESS_20).toBe(0)
    })

    it('level 2 has all three freshness types', () => {
      const chances = FITNESS_STUDIO_CARD_CHANCES[2]
      expect(chances.FRESHNESS_5).toBe(0.6)
      expect(chances.FRESHNESS_10).toBe(0.88)
      expect(chances.FRESHNESS_20).toBe(0.15)
    })

    it('level 3 has best chances for all freshness cards', () => {
      const chances = FITNESS_STUDIO_CARD_CHANCES[3]
      expect(chances.FRESHNESS_5).toBe(0.6)
      expect(chances.FRESHNESS_10).toBe(0.88)
      expect(chances.FRESHNESS_20).toBe(0.3)
    })
  })

  describe('YOUTH_ACADEMY_CARD_CHANCES', () => {
    it('level 1 (the new baseline) only has the basic youth player card', () => {
      const chances = YOUTH_ACADEMY_CARD_CHANCES[1]
      expect(chances.NEW_YOUTH_PLAYER_1).toBeGreaterThan(0)
      expect(chances.NEW_YOUTH_PLAYER_2).toBe(0)
      expect(chances.NEW_YOUTH_PLAYER_3).toBe(0)
    })

    it('does not define a level 0 entry — all teams start at level 1', () => {
      expect(YOUTH_ACADEMY_CARD_CHANCES[0]).toBeUndefined()
    })

    it('higher levels yield strictly more total youth cards per game day', () => {
      const totalForLevel = (lvl) => Object.values(YOUTH_ACADEMY_CARD_CHANCES[lvl]).reduce((a, b) => a + b, 0)
      expect(totalForLevel(2)).toBeGreaterThan(totalForLevel(1))
      expect(totalForLevel(3)).toBeGreaterThan(totalForLevel(2))
    })

    it('level 2 unlocks NEW_YOUTH_PLAYER_2; level 3 also unlocks NEW_YOUTH_PLAYER_3', () => {
      expect(YOUTH_ACADEMY_CARD_CHANCES[2].NEW_YOUTH_PLAYER_2).toBeGreaterThan(0)
      expect(YOUTH_ACADEMY_CARD_CHANCES[2].NEW_YOUTH_PLAYER_3).toBe(0)
      expect(YOUTH_ACADEMY_CARD_CHANCES[3].NEW_YOUTH_PLAYER_3).toBeGreaterThan(0)
    })

    it('targets roughly 2/3/4 cards per 34-game-day season for levels 1/2/3', () => {
      const SEASON_DAYS = 34
      const total = (lvl) => Object.values(YOUTH_ACADEMY_CARD_CHANCES[lvl]).reduce((a, b) => a + b, 0) * SEASON_DAYS
      expect(total(1)).toBeGreaterThanOrEqual(1.7)
      expect(total(1)).toBeLessThanOrEqual(2.5)
      expect(total(2)).toBeGreaterThanOrEqual(2.7)
      expect(total(2)).toBeLessThanOrEqual(3.5)
      expect(total(3)).toBeGreaterThanOrEqual(3.7)
      expect(total(3)).toBeLessThanOrEqual(4.5)
    })
  })

  describe('BUILDING_UPGRADES', () => {
    it('has correct costs and construction times for training area', () => {
      expect(BUILDING_UPGRADES.training_area_1).toEqual({ cost: 375_000, constructionDays: 5 })
      expect(BUILDING_UPGRADES.training_area_2).toEqual({ cost: 1_125_000, constructionDays: 10 })
      expect(BUILDING_UPGRADES.training_area_3).toEqual({ cost: 3_000_000, constructionDays: 17 })
    })

    it('has correct costs and construction times for fitness studio', () => {
      expect(BUILDING_UPGRADES.fitness_studio_1).toEqual({ cost: 300_000, constructionDays: 4 })
      expect(BUILDING_UPGRADES.fitness_studio_2).toEqual({ cost: 900_000, constructionDays: 8 })
      expect(BUILDING_UPGRADES.fitness_studio_3).toEqual({ cost: 2_625_000, constructionDays: 15 })
    })

    it('has correct costs and construction times for youth academy (no level 1 — all teams start at 1)', () => {
      expect(BUILDING_UPGRADES.youth_academy_1).toBeUndefined()
      expect(BUILDING_UPGRADES.youth_academy_2).toEqual({ cost: 3_000_000, constructionDays: 10 })
      expect(BUILDING_UPGRADES.youth_academy_3).toEqual({ cost: 9_000_000, constructionDays: 17 })
    })

    it('does not have upgrade for level 4', () => {
      expect(BUILDING_UPGRADES.training_area_4).toBeUndefined()
      expect(BUILDING_UPGRADES.fitness_studio_4).toBeUndefined()
      expect(BUILDING_UPGRADES.youth_academy_4).toBeUndefined()
    })
  })

  describe('getBuildingConstructionInfo', () => {
    it('returns underConstruction: false when no construction data', async () => {
      const building = testData.building()

      const info = await getBuildingConstructionInfo(building, 5, 1)

      expect(info.underConstruction).toBe(false)
    })

    it('returns underConstruction: true with remaining days', async () => {
      const building = testData.building({
        construction_end_game_day: 15,
        construction_end_season: 1,
        construction_target_level: 2
      })

      // Current: day 10, season 1. End: day 15, season 1. Remaining: 5
      const info = await getBuildingConstructionInfo(building, 10, 1)

      expect(info.underConstruction).toBe(true)
      expect(info.remainingGameDays).toBe(5)
      expect(info.targetLevel).toBe(2)
    })

    it('returns 0 remaining when end day reached', async () => {
      const building = testData.building({
        construction_end_game_day: 10,
        construction_end_season: 1,
        construction_target_level: 2
      })

      const info = await getBuildingConstructionInfo(building, 10, 1)

      expect(info.underConstruction).toBe(true)
      expect(info.remainingGameDays).toBe(0)
    })

    it('handles cross-season construction using actual season length', async () => {
      const building = testData.building({
        construction_end_game_day: 5,
        construction_end_season: 2,
        construction_target_level: 3
      })

      // Current: (1, 30). End: (2, 5). Default mock returns season length = 34.
      // Days left in season 1: 34 - 30 = 4. Plus 5 days in season 2 = 9.
      const info = await getBuildingConstructionInfo(building, 30, 1)

      expect(info.underConstruction).toBe(true)
      expect(info.remainingGameDays).toBe(9)
    })
  })

  describe('getTrainingAreaLevel', () => {
    it('returns building level when found', async () => {
      query.mockResolvedValue([{ level: 2 }])

      const level = await getTrainingAreaLevel(1)

      expect(level).toBe(2)
    })

    it('returns 1 as default when no building found', async () => {
      query.mockResolvedValue([])

      const level = await getTrainingAreaLevel(1)

      expect(level).toBe(1)
    })
  })

  describe('getAllTrainingAreaLevels', () => {
    it('returns map of team_id to level', async () => {
      query.mockResolvedValue([
        { team_id: 1, level: 2 },
        { team_id: 2, level: 0 },
        { team_id: 3, level: 3 }
      ])

      const map = await getAllTrainingAreaLevels()

      expect(map.get(1)).toBe(2)
      expect(map.get(2)).toBe(0)
      expect(map.get(3)).toBe(3)
    })
  })

  describe('getYouthAcademyLevel', () => {
    it('returns building level when found', async () => {
      query.mockResolvedValue([{ level: 2 }])
      const level = await getYouthAcademyLevel(1)
      expect(level).toBe(2)
    })

    it('returns 1 as default when no building found', async () => {
      query.mockResolvedValue([])
      const level = await getYouthAcademyLevel(1)
      expect(level).toBe(1)
    })
  })

  describe('getAllYouthAcademyLevels', () => {
    it('returns map of team_id to level', async () => {
      query.mockResolvedValue([
        { team_id: 1, level: 1 },
        { team_id: 2, level: 3 }
      ])
      const map = await getAllYouthAcademyLevels()
      expect(map.get(1)).toBe(1)
      expect(map.get(2)).toBe(3)
    })
  })

  describe('getFitnessStudioLevel', () => {
    it('returns building level when found', async () => {
      query.mockResolvedValue([{ level: 2 }])

      const level = await getFitnessStudioLevel(1)

      expect(level).toBe(2)
    })

    it('returns 1 as default when no building found', async () => {
      query.mockResolvedValue([])

      const level = await getFitnessStudioLevel(1)

      expect(level).toBe(1)
    })
  })

  describe('getAllFitnessStudioLevels', () => {
    it('returns map of team_id to level', async () => {
      query.mockResolvedValue([
        { team_id: 1, level: 1 },
        { team_id: 2, level: 0 },
        { team_id: 3, level: 3 }
      ])

      const map = await getAllFitnessStudioLevels()

      expect(map.get(1)).toBe(1)
      expect(map.get(2)).toBe(0)
      expect(map.get(3)).toBe(3)
    })
  })

  describe('getBuildingsForTeam', () => {
    it('returns buildings for team', async () => {
      const buildings = [testData.building()]
      query.mockResolvedValue(buildings)

      const result = await getBuildingsForTeam(1)

      expect(result).toEqual(buildings)
      expect(query).toHaveBeenCalledWith('SELECT * FROM building WHERE team_id=?', [1])
    })
  })

  describe('upgradeBuilding', () => {
    it('starts upgrade for valid building', async () => {
      const team = testData.team({ balance: 1_000_000 })
      const building = testData.building({ level: 0 })

      query.mockResolvedValueOnce([building]) // SELECT building
      query.mockResolvedValueOnce({ affectedRows: 1 }) // UPDATE building

      const result = await upgradeBuilding(team, 'training_area', 'en')

      expect(result.success).toBe(true)
      expect(updateTeamBalance).toHaveBeenCalledWith(team, -375_000, expect.any(String), 5, 1)
      expect(query).toHaveBeenCalledWith(
        'UPDATE building SET construction_end_game_day=?, construction_end_season=?, construction_target_level=? WHERE id=?',
        [10, 1, 1, building.id]
      )
      expect(addLogMessage).toHaveBeenCalled()
    })

    it('throws when building not found', async () => {
      const team = testData.team()
      query.mockResolvedValue([])

      await expect(upgradeBuilding(team, 'training_area', 'en'))
        .rejects.toThrow()
    })

    it('throws when already under construction', async () => {
      const team = testData.team()
      const building = testData.building({
        construction_end_game_day: 10,
        construction_end_season: 1,
        construction_target_level: 2
      })
      query.mockResolvedValue([building])

      await expect(upgradeBuilding(team, 'training_area', 'en'))
        .rejects.toThrow()
    })

    it('throws when at max level', async () => {
      const team = testData.team()
      const building = testData.building({ level: 3 })
      query.mockResolvedValue([building])

      await expect(upgradeBuilding(team, 'training_area', 'en'))
        .rejects.toThrow()
    })

    it('throws when insufficient funds', async () => {
      const team = testData.team({ balance: 100 })
      const building = testData.building({ level: 0 })
      query.mockResolvedValue([building])

      await expect(upgradeBuilding(team, 'training_area', 'en'))
        .rejects.toThrow()
    })
  })

  describe('completeBuildingConstructions', () => {
    it('completes constructions that are due', async () => {
      const building = testData.building({
        id: 1,
        team_id: 1,
        construction_end_game_day: 5,
        construction_end_season: 1,
        construction_target_level: 2,
        user_id: 1
      })
      const team = testData.team()

      query.mockResolvedValueOnce([building]) // SELECT buildings due
      query.mockResolvedValueOnce({ affectedRows: 1 }) // UPDATE building
      query.mockResolvedValueOnce([team]) // SELECT team

      await completeBuildingConstructions(5, 1)

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE building SET level=?'),
        [2, 1]
      )
      expect(addLogMessage).toHaveBeenCalled()
    })

    it('does nothing when no constructions are due', async () => {
      query.mockResolvedValue([])

      await completeBuildingConstructions(5, 1)

      expect(query).toHaveBeenCalledTimes(1) // Only the SELECT
    })
  })
})
