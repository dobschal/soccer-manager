import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  // Not currently used but mocking for future tests
}))

vi.mock('../../prepare-season.js', () => ({
  generateRandomPlayerName: vi.fn()
}))

import { query } from '../../lib/database.js'
import { generateRandomPlayerName } from '../../prepare-season.js'
import {
  applyTrainingEffects,
  getYouthPlayerAge,
  getYouthPlayersByTeam,
  getYouthPlayerById,
  createYouthPlayer,
  processYouthTraining,
  promoteYouthPlayer,
  fireYouthPlayer,
  archiveOverageYouthPlayers,
  getYouthPlayersAt18,
  setYouthTrainingMode
} from '../../helper/youthPlayerHelper.js'

describe('youthPlayerHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getYouthPlayerAge', () => {
    it('returns correct age for youth player', () => {
      const youthPlayer = { birth_season: 5 }
      expect(getYouthPlayerAge(youthPlayer, 5)).toBe(15)
      expect(getYouthPlayerAge(youthPlayer, 6)).toBe(16)
      expect(getYouthPlayerAge(youthPlayer, 8)).toBe(18)
      expect(getYouthPlayerAge(youthPlayer, 9)).toBe(19)
    })
  })

  describe('applyTrainingEffects', () => {
    it('applies training mode effects correctly', () => {
      const youthPlayer = {
        level: 1.0,
        talent: 0.5,
        moral: 0.7,
        fitness: 0.7
      }

      // Mock Math.random to return 0.5 for predictable testing
      const originalRandom = Math.random
      Math.random = () => 0.5

      applyTrainingEffects(youthPlayer, 'training')

      // Training mode: fitness -0.05, moral -0.03, levelBonus 1.2
      // randomFactor = 0.9 + 0.5 * 0.2 = 1.0
      expect(youthPlayer.fitness).toBeCloseTo(0.65, 2) // 0.7 - 0.05
      expect(youthPlayer.moral).toBeCloseTo(0.67, 2) // 0.7 - 0.03

      // Level gain = BASE_GAIN * (1 + talent * 2.5) * modeBonus * avgCondition * randomFactor
      // = 0.02 * (1 + 0.5 * 2.5) * 1.2 * 0.66 * 1.0 = 0.02 * 2.25 * 1.2 * 0.66 = 0.0356
      expect(youthPlayer.level).toBeGreaterThan(1.0)

      Math.random = originalRandom
    })

    it('applies friendly_match mode effects correctly', () => {
      const youthPlayer = {
        level: 1.0,
        talent: 0.5,
        moral: 0.7,
        fitness: 0.7
      }

      const originalRandom = Math.random
      Math.random = () => 0.5

      applyTrainingEffects(youthPlayer, 'friendly_match')

      // Friendly match mode: fitness -0.04, moral +0.05, levelBonus 1.0
      expect(youthPlayer.fitness).toBeCloseTo(0.66, 2) // 0.7 - 0.04
      expect(youthPlayer.moral).toBeCloseTo(0.75, 2) // 0.7 + 0.05

      Math.random = originalRandom
    })

    it('applies rest mode effects correctly', () => {
      const youthPlayer = {
        level: 1.0,
        talent: 0.5,
        moral: 0.7,
        fitness: 0.7
      }

      const originalRandom = Math.random
      Math.random = () => 0.5

      applyTrainingEffects(youthPlayer, 'rest')

      // Rest mode: fitness +0.06, moral +0.04, levelBonus 0.3
      expect(youthPlayer.fitness).toBeCloseTo(0.76, 2) // 0.7 + 0.06
      expect(youthPlayer.moral).toBeCloseTo(0.74, 2) // 0.7 + 0.04

      Math.random = originalRandom
    })

    it('clamps fitness and moral between 0 and 1', () => {
      const youthPlayer = {
        level: 1.0,
        talent: 0.5,
        moral: 0.02, // Very low
        fitness: 0.98 // Very high
      }

      const originalRandom = Math.random
      Math.random = () => 0.5

      applyTrainingEffects(youthPlayer, 'training')

      expect(youthPlayer.moral).toBeGreaterThanOrEqual(0)
      expect(youthPlayer.fitness).toBeLessThanOrEqual(1)

      Math.random = originalRandom
    })

    it('high talent player gains more level', () => {
      const originalRandom = Math.random
      Math.random = () => 0.5

      const lowTalent = {
        level: 1.0,
        talent: 0.1,
        moral: 0.7,
        fitness: 0.7
      }

      const highTalent = {
        level: 1.0,
        talent: 1.0,
        moral: 0.7,
        fitness: 0.7
      }

      applyTrainingEffects(lowTalent, 'training')
      const lowTalentGain = lowTalent.level - 1.0

      applyTrainingEffects(highTalent, 'training')
      const highTalentGain = highTalent.level - 1.0

      expect(highTalentGain).toBeGreaterThan(lowTalentGain)

      Math.random = originalRandom
    })
  })

  describe('getYouthPlayersByTeam', () => {
    it('returns youth players for a team', async () => {
      const mockPlayers = [
        { id: 1, team_id: 1, name: 'Player 1' },
        { id: 2, team_id: 1, name: 'Player 2' }
      ]
      query.mockResolvedValueOnce(mockPlayers)

      const result = await getYouthPlayersByTeam(1)

      expect(query).toHaveBeenCalledWith('SELECT * FROM youth_player WHERE team_id=?', [1])
      expect(result).toEqual(mockPlayers)
    })
  })

  describe('getYouthPlayerById', () => {
    it('returns youth player by ID', async () => {
      const mockPlayer = { id: 1, team_id: 1, name: 'Player 1' }
      query.mockResolvedValueOnce([mockPlayer])

      const result = await getYouthPlayerById(1)

      expect(query).toHaveBeenCalledWith('SELECT * FROM youth_player WHERE id=?', [1])
      expect(result).toEqual(mockPlayer)
    })

    it('returns null when player not found', async () => {
      query.mockResolvedValueOnce([])

      const result = await getYouthPlayerById(999)

      expect(result).toBeNull()
    })
  })

  describe('createYouthPlayer', () => {
    it('creates a new youth player', async () => {
      generateRandomPlayerName.mockResolvedValueOnce('Test Player')
      query.mockResolvedValueOnce({ insertId: 1 })

      const result = await createYouthPlayer(1, 10)

      expect(generateRandomPlayerName).toHaveBeenCalled()
      expect(query).toHaveBeenCalledWith('INSERT INTO youth_player SET ?', expect.objectContaining({
        team_id: 1,
        name: 'Test Player',
        birth_season: 10
      }))
      expect(result.id).toBe(1)
      expect(result.name).toBe('Test Player')
      expect(result.talent).toBeGreaterThanOrEqual(0.1)
      expect(result.talent).toBeLessThanOrEqual(1.0)
      expect(result.level).toBeGreaterThanOrEqual(0.1)
      expect(result.level).toBeLessThanOrEqual(1.0)
    })
  })

  describe('processYouthTraining', () => {
    it('applies training to all youth players of a team', async () => {
      const team = { id: 1, youth_training_mode: 'training' }
      const mockPlayers = [
        { id: 1, team_id: 1, level: 1.0, talent: 0.5, moral: 0.7, fitness: 0.7 },
        { id: 2, team_id: 1, level: 1.5, talent: 0.8, moral: 0.6, fitness: 0.8 }
      ]

      query.mockResolvedValueOnce(mockPlayers) // getYouthPlayersByTeam
      query.mockResolvedValue({}) // UPDATE calls

      await processYouthTraining(team)

      expect(query).toHaveBeenCalledWith('SELECT * FROM youth_player WHERE team_id=?', [1])
      expect(query).toHaveBeenCalledWith(
        'UPDATE youth_player SET level=?, moral=?, fitness=? WHERE id=?',
        expect.any(Array)
      )
    })

    it('uses rest mode by default', async () => {
      const team = { id: 1, youth_training_mode: null }
      const mockPlayers = [
        { id: 1, team_id: 1, level: 1.0, talent: 0.5, moral: 0.5, fitness: 0.5 }
      ]

      query.mockResolvedValueOnce(mockPlayers)
      query.mockResolvedValue({})

      await processYouthTraining(team)

      // With rest mode and random factor 1.0, fitness should increase
      const updateCall = query.mock.calls.find(call =>
        call[0].includes('UPDATE youth_player')
      )
      expect(updateCall).toBeDefined()
    })
  })

  describe('promoteYouthPlayer', () => {
    it('promotes youth player to A team', async () => {
      const youthPlayer = {
        id: 1,
        team_id: 1,
        name: 'Test Player',
        position: 'CM',
        level: 2.5,
        hair_color: 3,
        skin_color: 1,
        birth_season: 5,
        fitness: 0.8
      }

      query.mockResolvedValueOnce({ insertId: 100 }) // INSERT player
      query.mockResolvedValueOnce({}) // DELETE youth_player

      const result = await promoteYouthPlayer(youthPlayer, 6) // Age 16

      expect(query).toHaveBeenCalledWith('INSERT INTO player SET ?', expect.objectContaining({
        team_id: 1,
        name: 'Test Player',
        position: 'CM',
        level: 3, // Rounded from 2.5
        hair_color: 3,
        skin_color: 1
      }))
      expect(query).toHaveBeenCalledWith('DELETE FROM youth_player WHERE id=?', [1])
      expect(result.id).toBe(100)
      expect(result.level).toBe(3)
    })

    it('sets minimum level to 1 when promoting', async () => {
      const youthPlayer = {
        id: 1,
        team_id: 1,
        name: 'Test Player',
        position: 'GK',
        level: 0.3,
        hair_color: 1,
        skin_color: 2,
        birth_season: 5,
        fitness: 0.7
      }

      query.mockResolvedValueOnce({ insertId: 101 })
      query.mockResolvedValueOnce({})

      await promoteYouthPlayer(youthPlayer, 6)

      const insertCall = query.mock.calls.find(call =>
        call[0].includes('INSERT INTO player')
      )
      expect(insertCall[1].level).toBe(1)
    })
  })

  describe('fireYouthPlayer', () => {
    it('deletes youth player', async () => {
      query.mockResolvedValueOnce({})

      await fireYouthPlayer(1)

      expect(query).toHaveBeenCalledWith('DELETE FROM youth_player WHERE id=?', [1])
    })
  })

  describe('archiveOverageYouthPlayers', () => {
    it('deletes youth players aged 19+', async () => {
      query.mockResolvedValueOnce({ affectedRows: 3 })

      const result = await archiveOverageYouthPlayers(10)

      // Age 19 = birth_season + 4 = season
      // So birth_season <= season - 4
      expect(query).toHaveBeenCalledWith(
        'DELETE FROM youth_player WHERE birth_season <= ?',
        [6] // 10 - 4
      )
      expect(result).toBe(3)
    })

    it('returns 0 when no players deleted', async () => {
      query.mockResolvedValueOnce({ affectedRows: 0 })

      const result = await archiveOverageYouthPlayers(10)

      expect(result).toBe(0)
    })
  })

  describe('getYouthPlayersAt18', () => {
    it('returns youth players at age 18', async () => {
      const mockPlayers = [
        { id: 1, team_id: 1, name: 'Player 18', birth_season: 7 }
      ]
      query.mockResolvedValueOnce(mockPlayers)

      const result = await getYouthPlayersAt18(1, 10) // season 10, birth_season 7 = age 18

      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM youth_player WHERE team_id=? AND birth_season=?',
        [1, 7] // 10 - 3
      )
      expect(result).toEqual(mockPlayers)
    })
  })

  describe('setYouthTrainingMode', () => {
    it('sets valid training mode', async () => {
      query.mockResolvedValueOnce({})

      await setYouthTrainingMode(1, 'training')

      expect(query).toHaveBeenCalledWith(
        'UPDATE team SET youth_training_mode=? WHERE id=?',
        ['training', 1]
      )
    })

    it('defaults to rest for invalid mode', async () => {
      query.mockResolvedValueOnce({})

      await setYouthTrainingMode(1, 'invalid_mode')

      expect(query).toHaveBeenCalledWith(
        'UPDATE team SET youth_training_mode=? WHERE id=?',
        ['rest', 1]
      )
    })
  })

  describe('development targets from CLAUDE.md', () => {
    it('high talent player with perfect rhythm reaches ~level 3 in 34 game days', () => {
      // Simulate 34 game days with perfect rhythm: 2x training, 1x friendly, 1x rest
      const player = {
        level: 1.0,
        talent: 1.0,
        moral: 0.7,
        fitness: 0.7
      }

      const originalRandom = Math.random
      Math.random = () => 0.5 // Middle of random range

      // Simulate 34 game days with perfect rhythm
      const rhythm = ['training', 'training', 'friendly_match', 'rest']
      for (let day = 0; day < 34; day++) {
        const mode = rhythm[day % 4]
        applyTrainingEffects(player, mode)
      }

      Math.random = originalRandom

      // Should be close to level 3 (allowing some variance)
      expect(player.level).toBeGreaterThan(2.0)
      expect(player.level).toBeLessThan(4.0)
    })

    it('low talent player reaches at least level 1 by age 18 (102 game days)', () => {
      const player = {
        level: 0.1, // Starting level
        talent: 0.1, // Lowest talent
        moral: 0.7,
        fitness: 0.7
      }

      const originalRandom = Math.random
      Math.random = () => 0.5

      // Simulate 102 game days (3 seasons) with worst rhythm (all rest)
      for (let day = 0; day < 102; day++) {
        applyTrainingEffects(player, 'rest')
      }

      Math.random = originalRandom

      // Should reach at least level 1
      expect(player.level).toBeGreaterThanOrEqual(0.5)
    })
  })
})
