import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

vi.mock('../../helper/youthPlayerHelper.js', () => ({
  getYouthPlayersByTeam: vi.fn(),
  getYouthPlayerById: vi.fn(),
  getYouthPlayerAge: vi.fn(),
  promoteYouthPlayer: vi.fn(),
  fireYouthPlayer: vi.fn(),
  setYouthTrainingMode: vi.fn(),
  setYouthPlayerTrainingMode: vi.fn(),
  countYouthPlayersInMode: vi.fn().mockResolvedValue(0)
}))

vi.mock('../../helper/buildingHelper.js', () => ({
  getYouthAcademyLevel: vi.fn().mockResolvedValue(2)
}))

vi.mock('../../helper/playerHelper.js', () => ({
  getPlayersByTeamId: vi.fn().mockResolvedValue([]),
  MAX_TEAM_SIZE: 42
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key),
  getUserLocale: vi.fn(() => 'en')
}))

import { getTeam } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import {
  getYouthPlayersByTeam,
  getYouthPlayerById,
  getYouthPlayerAge,
  promoteYouthPlayer,
  fireYouthPlayer,
  setYouthTrainingMode,
  setYouthPlayerTrainingMode,
  countYouthPlayersInMode
} from '../../helper/youthPlayerHelper.js'
import { getYouthAcademyLevel } from '../../helper/buildingHelper.js'
import { getPlayersByTeamId } from '../../helper/playerHelper.js'
import handlers from '../../routes/youth.js'

describe('youth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getYouthTeam', () => {
    it('returns youth players with age but without talent', async () => {
      const team = testData.team({ youth_training_mode: 'training' })
      const youthPlayers = [
        { id: 1, name: 'Youth 1', talent: 0.8, moral: 0.7, fitness: 0.6, level: 5, birth_season: 0 },
        { id: 2, name: 'Youth 2', talent: 0.9, moral: 0.8, fitness: 0.7, level: 6, birth_season: 0 }
      ]

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 2, gameDay: 5 })
      getYouthPlayersByTeam.mockResolvedValue(youthPlayers)
      getYouthPlayerAge.mockImplementation((p, season) => 15 + season - p.birth_season)
      getYouthAcademyLevel.mockResolvedValue(2)

      const req = createMockRequest()
      const result = await handlers.getYouthTeam(req)

      expect(result.youthPlayers).toHaveLength(2)
      expect(result.youthPlayers[0].talent).toBeUndefined()
      expect(result.youthPlayers[0].age).toBeDefined()
      expect(result.trainingMode).toBe('training')
      expect(result.academyLevel).toBe(2)
      expect(result.slotsPerMode).toBe(2)
      expect(result.season).toBe(2)
    })

    it('caps slotsPerMode at 3 even for higher academy levels', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 1 })
      getYouthPlayersByTeam.mockResolvedValue([])
      getYouthAcademyLevel.mockResolvedValue(7)

      const req = createMockRequest()
      const result = await handlers.getYouthTeam(req)

      expect(result.slotsPerMode).toBe(3)
    })

    it('defaults training mode to rest when not set', async () => {
      const team = testData.team({ youth_training_mode: null })

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 1 })
      getYouthPlayersByTeam.mockResolvedValue([])
      getYouthAcademyLevel.mockResolvedValue(1)

      const req = createMockRequest()
      const result = await handlers.getYouthTeam(req)

      expect(result.trainingMode).toBe('rest')
    })
  })

  describe('setYouthPlayerTrainingMode', () => {
    it('assigns a youth player to a training mode', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7 })
      getYouthAcademyLevel.mockResolvedValue(1)
      countYouthPlayersInMode.mockResolvedValue(0)

      const req = createMockRequest()
      const result = await handlers.setYouthPlayerTrainingMode(11, 'training', req)

      expect(result.success).toBe(true)
      expect(setYouthPlayerTrainingMode).toHaveBeenCalledWith(11, 'training')
    })

    it('unassigns when mode is null', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7 })

      const req = createMockRequest()
      const result = await handlers.setYouthPlayerTrainingMode(11, null, req)

      expect(result.success).toBe(true)
      expect(setYouthPlayerTrainingMode).toHaveBeenCalledWith(11, null)
    })

    it('rejects mode when slots are full', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7 })
      getYouthAcademyLevel.mockResolvedValue(1)
      countYouthPlayersInMode.mockResolvedValue(1)

      const req = createMockRequest()
      await expect(handlers.setYouthPlayerTrainingMode(11, 'training', req))
        .rejects.toMatchObject({ message: 'error.youthModeSlotsFull' })
    })

    it('rejects youth player not owned by team', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 99 })

      const req = createMockRequest()
      await expect(handlers.setYouthPlayerTrainingMode(11, 'training', req))
        .rejects.toMatchObject({ message: 'error.notYourYouthPlayer' })
    })

    it('rejects invalid training mode', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7 })

      const req = createMockRequest()
      await expect(handlers.setYouthPlayerTrainingMode(11, 'bogus', req))
        .rejects.toMatchObject({ message: 'error.youthInvalidTrainingMode' })
    })
  })

  describe('setYouthTrainingMode', () => {
    it('sets valid training mode', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)
      setYouthTrainingMode.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.setYouthTrainingMode('training', req)

      expect(result.success).toBe(true)
      expect(setYouthTrainingMode).toHaveBeenCalledWith(team.id, 'training')
    })

    it('accepts friendly_match mode', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)
      setYouthTrainingMode.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.setYouthTrainingMode('friendly_match', req)

      expect(result.success).toBe(true)
    })

    it('accepts rest mode', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)
      setYouthTrainingMode.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.setYouthTrainingMode('rest', req)

      expect(result.success).toBe(true)
    })

    it('throws error for invalid training mode', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.setYouthTrainingMode('invalid_mode', req))
        .rejects.toMatchObject({ message: 'Invalid training mode' })
    })
  })

  describe('promoteYouthPlayer', () => {
    beforeEach(() => {
      getPlayersByTeamId.mockResolvedValue([])
    })

    it('promotes youth player aged 16 or older', async () => {
      const team = testData.team()
      const youthPlayer = { id: 1, name: 'Youth Star', team_id: team.id, birth_season: 0, level: 25 }
      const promotedPlayer = testData.player({ name: 'Youth Star', level: 25 })

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 2 })
      getYouthPlayerById.mockResolvedValue(youthPlayer)
      getYouthPlayerAge.mockReturnValue(16)
      promoteYouthPlayer.mockResolvedValue(promotedPlayer)

      const req = createMockRequest()
      const result = await handlers.promoteYouthPlayer(1, req)

      expect(result.success).toBe(true)
      expect(result.player).toEqual(promotedPlayer)
      expect(addLogMessage).toHaveBeenCalled()
    })

    it('throws error when A team is already at maximum squad size', async () => {
      const team = testData.team()
      const youthPlayer = { id: 1, name: 'Youth Star', team_id: team.id, birth_season: 0, level: 25 }

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 2 })
      getYouthPlayerById.mockResolvedValue(youthPlayer)
      getYouthPlayerAge.mockReturnValue(16)
      getPlayersByTeamId.mockResolvedValue(new Array(42).fill({}))

      const req = createMockRequest()

      await expect(handlers.promoteYouthPlayer(1, req))
        .rejects.toMatchObject({ message: 'error.teamTooLarge' })
      expect(promoteYouthPlayer).not.toHaveBeenCalled()
    })

    it('throws error for youth player too young', async () => {
      const team = testData.team()
      const youthPlayer = { id: 1, name: 'Young Player', team_id: team.id, birth_season: 0 }

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 0 })
      getYouthPlayerById.mockResolvedValue(youthPlayer)
      getYouthPlayerAge.mockReturnValue(15)

      const req = createMockRequest()

      await expect(handlers.promoteYouthPlayer(1, req))
        .rejects.toMatchObject({ message: 'error.youthPlayerTooYoung' })
    })

    it('throws error for non-existent youth player', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 2 })
      getYouthPlayerById.mockResolvedValue(null)

      const req = createMockRequest()

      await expect(handlers.promoteYouthPlayer(999, req))
        .rejects.toMatchObject({ message: 'error.youthPlayerNotFound' })
    })

    it('throws error for youth player not owned by team', async () => {
      const team = testData.team({ id: 1 })
      const youthPlayer = { id: 1, name: 'Other Youth', team_id: 999 }

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 2 })
      getYouthPlayerById.mockResolvedValue(youthPlayer)

      const req = createMockRequest()

      await expect(handlers.promoteYouthPlayer(1, req))
        .rejects.toMatchObject({ message: 'error.notYourYouthPlayer' })
    })
  })

  describe('fireYouthPlayer', () => {
    it('fires youth player owned by team', async () => {
      const team = testData.team()
      const youthPlayer = { id: 1, name: 'Fired Youth', team_id: team.id }

      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue(youthPlayer)
      fireYouthPlayer.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.fireYouthPlayer(1, req)

      expect(result.success).toBe(true)
      expect(fireYouthPlayer).toHaveBeenCalledWith(1)
      expect(addLogMessage).toHaveBeenCalled()
    })

    it('throws error for non-existent youth player', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue(null)

      const req = createMockRequest()

      await expect(handlers.fireYouthPlayer(999, req))
        .rejects.toMatchObject({ message: 'error.youthPlayerNotFound' })
    })

    it('throws error for youth player not owned by team', async () => {
      const team = testData.team({ id: 1 })
      const youthPlayer = { id: 1, name: 'Other Youth', team_id: 999 }

      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue(youthPlayer)

      const req = createMockRequest()

      await expect(handlers.fireYouthPlayer(1, req))
        .rejects.toMatchObject({ message: 'error.notYourYouthPlayer' })
    })
  })
})
