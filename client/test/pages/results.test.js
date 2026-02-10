import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

// Mock dependencies
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getMyTeam: vi.fn(),
    getCurrentGameday: vi.fn(),
    getResults: vi.fn(),
    getStanding: vi.fn(),
    getSeasonResults: vi.fn(),
    getPlayersWithIds: vi.fn()
  }
}))

vi.mock('../../partials/emblem.js', () => ({
  renderEmblem: vi.fn(() => '<svg class="emblem-mock"></svg>')
}))

vi.mock('../../partials/playerImage.js', () => ({
  renderPlayerImage: vi.fn(() => Promise.resolve('<div class="player-image-mock"></div>'))
}))

vi.mock('../../partials/gameModal.js', () => ({
  showGameModal: vi.fn()
}))

vi.mock('../../partials/playerModal.js', () => ({
  showPlayerModal: vi.fn()
}))

vi.mock('../../partials/tutorialOverlay.js', () => ({
  showTutorialIfNeeded: vi.fn()
}))

vi.mock('../../util/league.js', () => ({
  formatLeague: vi.fn((level, league) => `${level + 1}. League ${league}`)
}))

vi.mock('../../lib/router.js', () => ({
  getQueryParams: vi.fn(() => ({})),
  setQueryParams: vi.fn(),
  goTo: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

import { server } from '../../lib/gateway.js'
import { ResultsPage } from '../../pages/results.js'
import { showGameModal } from '../../partials/gameModal.js'
import { showPlayerModal } from '../../partials/playerModal.js'
import { showTutorialIfNeeded } from '../../partials/tutorialOverlay.js'
import { getQueryParams, setQueryParams } from '../../lib/router.js'

describe('ResultsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getQueryParams.mockReturnValue({})
  })

  describe('ResultsPage class', () => {
    it('loads results and standing from server', async () => {
      const team = testData.team({ level: 1, league: 0 })
      const results = [
        { id: 1, team1: 'Team A', team2: 'Team B', team1Id: 1, team2Id: 2, goalsTeam1: 2, goalsTeam2: 1 }
      ]
      const standing = [
        { team: { id: 1, name: 'Team A' }, points: 3, goals: 2, against: 1, games: 1 }
      ]

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 1, gameDay: 5 })
      server.getResults.mockResolvedValue({ results })
      server.getStanding.mockResolvedValue(standing)
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      await page.load()

      expect(page.results).toEqual(results)
      expect(page.standing).toEqual(standing)
      expect(page.myTeamId).toBe(team.id)
    })

    it('template contains results table', async () => {
      const team = testData.team()
      const results = [
        { id: 1, team1: 'Home', team2: 'Away', team1Id: 1, team2Id: 2, goalsTeam1: 1, goalsTeam2: 0 }
      ]
      const standing = [
        { team: { id: 1, name: 'Home' }, points: 3, goals: 1, against: 0, games: 1 }
      ]

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 1 })
      server.getResults.mockResolvedValue({ results })
      server.getStanding.mockResolvedValue(standing)
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      await page.load()

      const html = page.template
      expect(html).toContain('results.resultsTitle')
      expect(html).toContain('results.standing')
      expect(html).toContain('results.topScorer')
    })

    it('shows tutorial on mount', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 0 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      await page.load()
      page.onMounted()

      expect(showTutorialIfNeeded).toHaveBeenCalledWith('results', expect.any(Object))
    })
  })

  describe('league navigation', () => {
    it('getPrevLeague decrements league', () => {
      const page = new ResultsPage()
      const result = page._getPrevLeague(1, 1)

      expect(result).toEqual({ level: 1, league: 0 })
    })

    it('getPrevLeague goes to previous level when at league 0', () => {
      const page = new ResultsPage()
      const result = page._getPrevLeague(2, 0)

      // Level 1 has 2 leagues (0, 1), so max is 1
      expect(result).toEqual({ level: 1, league: 1 })
    })

    it('getPrevLeague stays at level 0 league 0', () => {
      const page = new ResultsPage()
      const result = page._getPrevLeague(0, 0)

      expect(result).toEqual({ level: 0, league: 0 })
    })

    it('getNextLeague increments league', () => {
      const page = new ResultsPage()
      const result = page._getNextLeague(1, 0)

      expect(result).toEqual({ level: 1, league: 1 })
    })

    it('getNextLeague goes to next level when at max league', () => {
      const page = new ResultsPage()
      // Level 1 has 2 leagues (0, 1), so at league 1, go to level 2, league 0
      const result = page._getNextLeague(1, 1)

      expect(result).toEqual({ level: 2, league: 0 })
    })
  })

  describe('query handling', () => {
    it('shows game modal when game_id in query', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 0 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      page.level = 0
      page.league = 0
      page.season = 0
      page.gameDay = 0
      page.results = []
      page.standing = []
      page.topScorer = []

      await page.onQueryChanged({ game_id: '42' })

      expect(showGameModal).toHaveBeenCalledWith(42)
    })

    it('shows player modal when player_id in query', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 0 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      page.level = 0
      page.league = 0
      page.season = 0
      page.gameDay = 0
      page.results = []
      page.standing = []
      page.topScorer = []

      await page.onQueryChanged({ player_id: '15' })

      expect(showPlayerModal).toHaveBeenCalledWith(15)
    })
  })

  describe('event handlers', () => {
    it('prev game day button decrements game day', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 1, gameDay: 5 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      await page.load()

      page.events['#prev-game-day-button'].click()

      expect(setQueryParams).toHaveBeenCalledWith({ season: 1, gameDay: 3 }) // gameDay was set to 4 (5-1 in load), then decrement to 3
    })

    it('next game day button increments game day', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 1, gameDay: 5 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      await page.load()

      page.events['#next-game-day-button'].click()

      expect(setQueryParams).toHaveBeenCalledWith({ season: 1, gameDay: 5 })
    })

    it('prev season button decrements season', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 2, gameDay: 5 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      await page.load()

      page.events['#prev-season-button'].click()

      expect(setQueryParams).toHaveBeenCalledWith({ season: 1, gameDay: 0 })
    })

    it('next season button increments season', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 1, gameDay: 5 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      await page.load()

      page.events['#next-season-button'].click()

      expect(setQueryParams).toHaveBeenCalledWith({ season: 2, gameDay: 0 })
    })
  })

  describe('standing rendering', () => {
    it('highlights own team in standing', async () => {
      const team = testData.team({ id: 5 })
      const standing = [
        { team: { id: 5, name: 'My Team', user_id: 1 }, points: 10, goals: 8, against: 3, games: 5 }
      ]

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 5 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue(standing)
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      await page.load()

      const html = page._renderStandingListItem(standing[0], 0)
      expect(html).toContain('table-info')
    })

    it('shows promotion zone for top 2 teams', async () => {
      const team = testData.team({ id: 1 })
      const standing = [
        { team: { id: 2, name: 'Other Team' }, points: 10, goals: 8, against: 3, games: 5 }
      ]

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 5 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue(standing)
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      await page.load()

      const html = page._renderStandingListItem(standing[0], 0)
      expect(html).toContain('table-success')
    })

    it('shows relegation zone for bottom teams', async () => {
      const team = testData.team({ id: 1 })
      const standing = [
        { team: { id: 2, name: 'Bottom Team' }, points: 0, goals: 0, against: 10, games: 5 }
      ]

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 5 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue(standing)
      server.getSeasonResults.mockResolvedValue([])

      const page = new ResultsPage()
      await page.load()

      // Index 14 or higher gets relegation warning
      const html = page._renderStandingListItem(standing[0], 14)
      expect(html).toContain('table-warning')
    })
  })
})
