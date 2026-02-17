import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 5, season: 1 })
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
  calculateConstructionEndDate: vi.fn().mockReturnValue({ endGameDay: 10, endSeason: 1 })
}))

import { query } from '../../lib/database.js'
import { updateTeamBalance } from '../../helper/financeHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import {
  getBuildingConstructionInfo,
  TRAINING_AREA_CARD_CHANCES,
  BUILDING_UPGRADES,
  upgradeBuilding,
  completeBuildingConstructions,
  getTrainingAreaLevel,
  getAllTrainingAreaLevels,
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

  describe('BUILDING_UPGRADES', () => {
    it('has correct costs and construction times', () => {
      expect(BUILDING_UPGRADES.training_area_1).toEqual({ cost: 500_000, constructionDays: 5 })
      expect(BUILDING_UPGRADES.training_area_2).toEqual({ cost: 1_500_000, constructionDays: 10 })
      expect(BUILDING_UPGRADES.training_area_3).toEqual({ cost: 4_000_000, constructionDays: 17 })
    })

    it('does not have upgrade for level 4', () => {
      expect(BUILDING_UPGRADES.training_area_4).toBeUndefined()
    })
  })

  describe('getBuildingConstructionInfo', () => {
    it('returns underConstruction: false when no construction data', () => {
      const building = testData.building()

      const info = getBuildingConstructionInfo(building, 5, 1)

      expect(info.underConstruction).toBe(false)
    })

    it('returns underConstruction: true with remaining days', () => {
      const building = testData.building({
        construction_end_game_day: 15,
        construction_end_season: 1,
        construction_target_level: 2
      })

      // Current: day 10, season 1. End: day 15, season 1. Remaining: 5
      const info = getBuildingConstructionInfo(building, 10, 1)

      expect(info.underConstruction).toBe(true)
      expect(info.remainingGameDays).toBe(5)
      expect(info.targetLevel).toBe(2)
    })

    it('returns 0 remaining when end day reached', () => {
      const building = testData.building({
        construction_end_game_day: 10,
        construction_end_season: 1,
        construction_target_level: 2
      })

      const info = getBuildingConstructionInfo(building, 10, 1)

      expect(info.underConstruction).toBe(true)
      expect(info.remainingGameDays).toBe(0)
    })

    it('handles cross-season construction', () => {
      const building = testData.building({
        construction_end_game_day: 5,
        construction_end_season: 2,
        construction_target_level: 3
      })

      // Current: day 30, season 1. End: day 5, season 2.
      // Current total: 1*34 + 30 = 64
      // End total: 2*34 + 5 = 73
      // Remaining: 9
      const info = getBuildingConstructionInfo(building, 30, 1)

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
      expect(updateTeamBalance).toHaveBeenCalledWith(team, -500_000, expect.any(String), 5, 1)
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
