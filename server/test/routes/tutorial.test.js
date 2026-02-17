import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import handlers from '../../routes/tutorial.js'

describe('tutorial routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getTutorialStatus', () => {
    it('returns empty object for team with no tutorial_completed', async () => {
      const team = testData.team({ tutorial_completed: null })
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()
      const result = await handlers.getTutorialStatus(req)

      expect(result).toEqual({ tutorialCompleted: {} })
    })

    it('returns parsed tutorial status for team', async () => {
      const team = testData.team({
        tutorial_completed: '{"dashboard": true, "team": true}'
      })
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()
      const result = await handlers.getTutorialStatus(req)

      expect(result).toEqual({
        tutorialCompleted: {
          dashboard: true,
          team: true
        }
      })
    })

    it('handles empty string tutorial_completed', async () => {
      const team = testData.team({ tutorial_completed: '' })
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()
      const result = await handlers.getTutorialStatus(req)

      expect(result).toEqual({ tutorialCompleted: {} })
    })
  })

  describe('completeTutorial', () => {
    it('marks tutorial as completed for valid key', async () => {
      const team = testData.team({ tutorial_completed: '{}' })
      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.completeTutorial('dashboard', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'UPDATE team SET tutorial_completed=? WHERE id=?',
        ['{"dashboard":true}', team.id]
      )
    })

    it('preserves existing completed tutorials', async () => {
      const team = testData.team({
        tutorial_completed: '{"team": true}'
      })
      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      await handlers.completeTutorial('dashboard', req)

      expect(query).toHaveBeenCalledWith(
        'UPDATE team SET tutorial_completed=? WHERE id=?',
        [expect.stringContaining('"team":true'), team.id]
      )
      expect(query).toHaveBeenCalledWith(
        'UPDATE team SET tutorial_completed=? WHERE id=?',
        [expect.stringContaining('"dashboard":true'), team.id]
      )
    })

    it('throws error for invalid tutorial key', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.completeTutorial('invalid_key', req))
        .rejects.toMatchObject({ message: 'Invalid tutorial key' })
    })

    it('accepts all valid tutorial keys', async () => {
      const validKeys = ['results', 'team', 'trades', 'dashboard', 'stadium', 'finances', 'youth', 'buildings']

      for (const key of validKeys) {
        vi.clearAllMocks()
        const team = testData.team({ tutorial_completed: '{}' })
        getTeam.mockResolvedValue(team)
        query.mockResolvedValue({})

        const req = createMockRequest()
        const result = await handlers.completeTutorial(key, req)

        expect(result).toEqual({ success: true })
      }
    })

    it('handles null tutorial_completed when completing', async () => {
      const team = testData.team({ tutorial_completed: null })
      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.completeTutorial('stadium', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'UPDATE team SET tutorial_completed=? WHERE id=?',
        ['{"stadium":true}', team.id]
      )
    })
  })
})
