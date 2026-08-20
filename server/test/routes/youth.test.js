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

vi.mock('../../helper/playerHistoryHelper.js', () => ({
  addPlayerHistory: vi.fn()
}))

vi.mock('../../helper/youthPlayerHelper.js', () => ({
  getYouthPlayersByTeam: vi.fn(),
  getYouthPlayerById: vi.fn(),
  getYouthPlayerAge: vi.fn(),
  promoteYouthPlayer: vi.fn(),
  fireYouthPlayer: vi.fn(),
  setYouthTrainingMode: vi.fn(),
  setYouthPlayerTrainingMode: vi.fn(),
  countYouthPlayersInMode: vi.fn().mockResolvedValue(0),
  calculateYouthPlayerValue: vi.fn(() => 75000)
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

vi.mock('../../lib/websocket.js', () => ({
  sendToUser: vi.fn().mockReturnValue(true)
}))

vi.mock('../../helper/financeHelper.js', () => ({
  updateTeamBalance: vi.fn()
}))

import { sendToUser } from '../../lib/websocket.js'
import { SERVER_EVENTS } from '../../../client/lib/serverEvents.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import { addPlayerHistory } from '../../helper/playerHistoryHelper.js'
import {
  getYouthPlayersByTeam,
  getYouthPlayerById,
  getYouthPlayerAge,
  promoteYouthPlayer,
  fireYouthPlayer,
  setYouthTrainingMode,
  setYouthPlayerTrainingMode,
  countYouthPlayersInMode,
  calculateYouthPlayerValue
} from '../../helper/youthPlayerHelper.js'
import { getYouthAcademyLevel } from '../../helper/buildingHelper.js'
import { getPlayersByTeamId } from '../../helper/playerHelper.js'
import { updateTeamBalance } from '../../helper/financeHelper.js'
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
      // Level 2: training/friendly = 3 (academyLevel + 1), rest is unlimited
      expect(result.slotsByMode).toEqual({ training: 3, friendly_match: 3, rest: null })
      expect(result.season).toBe(2)
    })

    it('rest mode is unlimited regardless of academy level', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 1 })
      getYouthPlayersByTeam.mockResolvedValue([])
      getYouthAcademyLevel.mockResolvedValue(1)

      const req = createMockRequest()
      const result = await handlers.getYouthTeam(req)

      expect(result.slotsByMode.rest).toBeNull()
      expect(result.slotsByMode.training).toBe(2)
      expect(result.slotsByMode.friendly_match).toBe(2)
    })

    it('caps training/friendly slots at 4 for higher academy levels', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 1 })
      getYouthPlayersByTeam.mockResolvedValue([])
      getYouthAcademyLevel.mockResolvedValue(7)

      const req = createMockRequest()
      const result = await handlers.getYouthTeam(req)

      expect(result.slotsByMode).toEqual({ training: 4, friendly_match: 4, rest: null })
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
      const team = testData.team({ id: 7, user_id: 77 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7, training_mode: 'rest' })
      getYouthAcademyLevel.mockResolvedValue(1)
      countYouthPlayersInMode.mockResolvedValue(0)

      const req = createMockRequest()
      const result = await handlers.setYouthPlayerTrainingMode(11, 'training', req)

      expect(result.success).toBe(true)
      expect(setYouthPlayerTrainingMode).toHaveBeenCalledWith(11, 'training')
    })

    it('emits YOUTH_PLAYER_TRAINING_MODE_CHANGED with previousMode + newMode on assign', async () => {
      const team = testData.team({ id: 7, user_id: 77 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7, training_mode: 'rest' })
      getYouthAcademyLevel.mockResolvedValue(1)
      countYouthPlayersInMode.mockResolvedValue(0)

      const req = createMockRequest()
      await handlers.setYouthPlayerTrainingMode(11, 'training', req)

      expect(sendToUser).toHaveBeenCalledWith(
        77,
        SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name,
        { youthPlayerId: 11, previousMode: 'rest', newMode: 'training' }
      )
    })

    it('emits YOUTH_PLAYER_TRAINING_MODE_CHANGED with newMode=null when unassigning', async () => {
      const team = testData.team({ id: 7, user_id: 77 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7, training_mode: 'training' })

      const req = createMockRequest()
      await handlers.setYouthPlayerTrainingMode(11, null, req)

      expect(sendToUser).toHaveBeenCalledWith(
        77,
        SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name,
        { youthPlayerId: 11, previousMode: 'training', newMode: null }
      )
    })

    it('does not emit when the mode is unchanged (no-op call)', async () => {
      const team = testData.team({ id: 7, user_id: 77 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7, training_mode: 'rest' })
      getYouthAcademyLevel.mockResolvedValue(1)
      countYouthPlayersInMode.mockResolvedValue(0)

      const req = createMockRequest()
      await handlers.setYouthPlayerTrainingMode(11, 'rest', req)

      expect(sendToUser).not.toHaveBeenCalled()
    })

    it('does not emit for teams without a user (bot-owned team)', async () => {
      const team = testData.team({ id: 7, user_id: null })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7, training_mode: 'rest' })
      getYouthAcademyLevel.mockResolvedValue(1)
      countYouthPlayersInMode.mockResolvedValue(0)

      const req = createMockRequest()
      await handlers.setYouthPlayerTrainingMode(11, 'training', req)

      expect(sendToUser).not.toHaveBeenCalled()
    })

    it('unassigns when mode is null', async () => {
      const team = testData.team({ id: 7, user_id: 77 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7, training_mode: 'training' })

      const req = createMockRequest()
      const result = await handlers.setYouthPlayerTrainingMode(11, null, req)

      expect(result.success).toBe(true)
      expect(setYouthPlayerTrainingMode).toHaveBeenCalledWith(11, null)
    })

    it('rejects training assignment when its 2 level-1 slots are full', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7 })
      getYouthAcademyLevel.mockResolvedValue(1)
      countYouthPlayersInMode.mockResolvedValue(2)

      const req = createMockRequest()
      await expect(handlers.setYouthPlayerTrainingMode(11, 'training', req))
        .rejects.toMatchObject({ message: 'error.youthModeSlotsFull' })
    })

    it('allows assigning to rest even when training is capped', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7 })
      getYouthAcademyLevel.mockResolvedValue(1)
      countYouthPlayersInMode.mockResolvedValue(3)

      const req = createMockRequest()
      const result = await handlers.setYouthPlayerTrainingMode(11, 'rest', req)

      expect(result.success).toBe(true)
    })

    it('never rejects a rest assignment — rest is the default mode and unlimited', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      getYouthPlayerById.mockResolvedValue({ id: 11, team_id: 7 })
      getYouthAcademyLevel.mockResolvedValue(1)
      // Even a whole squad already resting must not block another one: a player
      // without an own mode rests anyway, so the mode cannot be "full".
      countYouthPlayersInMode.mockResolvedValue(9)

      const req = createMockRequest()
      const result = await handlers.setYouthPlayerTrainingMode(11, 'rest', req)

      expect(result.success).toBe(true)
      expect(setYouthPlayerTrainingMode).toHaveBeenCalledWith(11, 'rest')
      // The cap is not even looked up for rest.
      expect(countYouthPlayersInMode).not.toHaveBeenCalled()
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

    it('records the promotion in the player history', async () => {
      const team = testData.team()
      const youthPlayer = { id: 1, name: 'Youth Star', team_id: team.id, birth_season: 0, level: 25 }
      const promotedPlayer = testData.player({ id: 4711, name: 'Youth Star', level: 25 })

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 2 })
      getYouthPlayerById.mockResolvedValue(youthPlayer)
      getYouthPlayerAge.mockReturnValue(16)
      promoteYouthPlayer.mockResolvedValue(promotedPlayer)

      const req = createMockRequest()
      await handlers.promoteYouthPlayer(1, req)

      expect(addPlayerHistory).toHaveBeenCalledWith(4711, 'YOUTH_PROMOTION', team.name)
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

describe('youth.sellYouthPlayer (#524)', () => {
  const team = { id: 7, user_id: 1, name: 'Test FC' }

  beforeEach(() => {
    vi.clearAllMocks()
    getTeam.mockResolvedValue(team)
    getGameDayAndSeason.mockResolvedValue({ gameDay: 3, season: 5 })
    calculateYouthPlayerValue.mockReturnValue(75000)
  })

  it('credits the club and removes the player', async () => {
    getYouthPlayerById.mockResolvedValue({ id: 55, team_id: 7, name: 'Max Mustermann', level: 8, talent: 0.6 })

    const result = await handlers.sellYouthPlayer(55, createMockRequest())

    expect(result).toEqual({ success: true, value: 75000 })
    expect(fireYouthPlayer).toHaveBeenCalledWith(55)
    expect(updateTeamBalance).toHaveBeenCalledWith(team, 75000, expect.any(String), 3, 5)
  })

  it('removes the player before booking the payout', async () => {
    getYouthPlayerById.mockResolvedValue({ id: 55, team_id: 7, name: 'Max', level: 8, talent: 0.6 })
    const order = []
    fireYouthPlayer.mockImplementation(async () => { order.push('remove') })
    updateTeamBalance.mockImplementation(async () => { order.push('pay') })

    await handlers.sellYouthPlayer(55, createMockRequest())

    // Paying first and then failing to delete would leave the club with both.
    expect(order).toEqual(['remove', 'pay'])
  })

  it('logs the sale for the manager', async () => {
    getYouthPlayerById.mockResolvedValue({ id: 55, team_id: 7, name: 'Max', level: 8, talent: 0.6 })

    await handlers.sellYouthPlayer(55, createMockRequest())

    expect(addLogMessage).toHaveBeenCalledWith(
      'log.youthPlayerSold', team, null, null, 'money', undefined, 'success'
    )
  })

  it('rejects a player from another team', async () => {
    getYouthPlayerById.mockResolvedValue({ id: 55, team_id: 999, name: 'Max' })

    await expect(handlers.sellYouthPlayer(55, createMockRequest()))
      .rejects.toMatchObject({ message: 'error.notYourYouthPlayer' })
    expect(fireYouthPlayer).not.toHaveBeenCalled()
    expect(updateTeamBalance).not.toHaveBeenCalled()
  })

  it('rejects an unknown player', async () => {
    getYouthPlayerById.mockResolvedValue(null)

    await expect(handlers.sellYouthPlayer(55, createMockRequest()))
      .rejects.toMatchObject({ message: 'error.youthPlayerNotFound' })
    expect(updateTeamBalance).not.toHaveBeenCalled()
  })

  it('exposes the sale value with every youth player, but never the talent', async () => {
    getYouthPlayersByTeam.mockResolvedValue([
      { id: 55, team_id: 7, name: 'Max', level: 8, talent: 0.6, birth_season: 5 }
    ])
    getYouthPlayerAge.mockReturnValue(16)

    const result = await handlers.getYouthTeam(createMockRequest())

    expect(result.youthPlayers[0].market_value).toBe(75000)
    expect(result.youthPlayers[0].talent).toBeUndefined()
  })
})
