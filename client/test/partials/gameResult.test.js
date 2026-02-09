import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../../partials/emblem.js', () => ({
  renderEmblem: vi.fn((team, size) => `<svg class="emblem" data-size="${size}"></svg>`)
}))

import { renderGameResult } from '../../partials/gameResult.js'
import { renderEmblem } from '../../partials/emblem.js'

describe('gameResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('renderGameResult', () => {
    it('renders team names', () => {
      const result = renderGameResult({
        team1: { name: 'Home FC' },
        team2: { name: 'Away FC' },
        team1Name: 'Home FC',
        team2Name: 'Away FC',
        isTeam1Highlighted: false,
        centerContent: '<span>2:1</span>'
      })

      expect(result).toContain('Home FC')
      expect(result).toContain('Away FC')
    })

    it('renders center content', () => {
      const result = renderGameResult({
        team1: { name: 'Team A' },
        team2: { name: 'Team B' },
        team1Name: 'Team A',
        team2Name: 'Team B',
        isTeam1Highlighted: false,
        centerContent: '<div class="score">3:0</div>'
      })

      expect(result).toContain('<div class="score">3:0</div>')
    })

    it('highlights team 1 when isTeam1Highlighted is true', () => {
      const result = renderGameResult({
        team1: { name: 'My Team' },
        team2: { name: 'Other' },
        team1Name: 'My Team',
        team2Name: 'Other',
        isTeam1Highlighted: true,
        centerContent: '<span>1:0</span>'
      })

      // Team 1 should have font-weight-bold
      expect(result).toMatch(/col text-center font-weight-bold[\s\S]*My Team/)
    })

    it('highlights team 2 when isTeam1Highlighted is false', () => {
      const result = renderGameResult({
        team1: { name: 'Home' },
        team2: { name: 'My Team' },
        team1Name: 'Home',
        team2Name: 'My Team',
        isTeam1Highlighted: false,
        centerContent: '<span>0:2</span>'
      })

      // Team 2 should have font-weight-bold (it's the second col element)
      const matches = result.match(/col text-center font-weight-bold/g)
      expect(matches).toHaveLength(1) // Only team 2 is bold
    })

    it('renders emblems for both teams', () => {
      const team1 = { name: 'Team 1', color: '#FF0000' }
      const team2 = { name: 'Team 2', color: '#00FF00' }

      renderGameResult({
        team1,
        team2,
        team1Name: 'Team 1',
        team2Name: 'Team 2',
        isTeam1Highlighted: false,
        centerContent: '<span>1:1</span>'
      })

      // Should call renderEmblem for each team at two sizes (60 and 120)
      expect(renderEmblem).toHaveBeenCalledWith(team1, 60)
      expect(renderEmblem).toHaveBeenCalledWith(team1, 120)
      expect(renderEmblem).toHaveBeenCalledWith(team2, 60)
      expect(renderEmblem).toHaveBeenCalledWith(team2, 120)
    })

    it('renders as link when href is provided', () => {
      const result = renderGameResult({
        team1: { name: 'Team A' },
        team2: { name: 'Team B' },
        team1Name: 'Team A',
        team2Name: 'Team B',
        isTeam1Highlighted: false,
        centerContent: '<span>2:2</span>',
        href: '#game?id=123'
      })

      expect(result).toContain('<a class="row')
      expect(result).toContain('href="#game?id=123"')
    })

    it('renders as div when no href', () => {
      const result = renderGameResult({
        team1: { name: 'Team A' },
        team2: { name: 'Team B' },
        team1Name: 'Team A',
        team2Name: 'Team B',
        isTeam1Highlighted: false,
        centerContent: '<span>1:0</span>'
      })

      expect(result).toContain('<div class="row')
      expect(result).not.toContain('href=')
    })

    it('handles null team for emblem', () => {
      const result = renderGameResult({
        team1: null,
        team2: { name: 'Team B' },
        team1Name: 'Unknown',
        team2Name: 'Team B',
        isTeam1Highlighted: false,
        centerContent: '<span>?:?</span>'
      })

      // Should still render team names even without emblem
      expect(result).toContain('Unknown')
      expect(result).toContain('Team B')
    })

    it('has responsive emblem sizes', () => {
      renderGameResult({
        team1: { name: 'Team 1' },
        team2: { name: 'Team 2' },
        team1Name: 'Team 1',
        team2Name: 'Team 2',
        isTeam1Highlighted: false,
        centerContent: ''
      })

      // 60px for small screens
      expect(renderEmblem).toHaveBeenCalledWith(expect.anything(), 60)
      // 120px for larger screens
      expect(renderEmblem).toHaveBeenCalledWith(expect.anything(), 120)
    })

    it('uses flexbox layout', () => {
      const result = renderGameResult({
        team1: { name: 'A' },
        team2: { name: 'B' },
        team1Name: 'A',
        team2Name: 'B',
        isTeam1Highlighted: false,
        centerContent: ''
      })

      expect(result).toContain('d-flex')
      expect(result).toContain('align-items-center')
      expect(result).toContain('flex-nowrap')
    })
  })
})
