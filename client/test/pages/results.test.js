import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

// Mock dependencies
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getMyTeam: vi.fn(),
    getCurrentGameday: vi.fn(),
    getResults: vi.fn(),
    getStanding: vi.fn(),
    getTopScorers: vi.fn(),
    getSuspendedPlayers: vi.fn(),
    getInjuredPlayers: vi.fn(),
    getTeamStats: vi.fn(),
    getLeagueStadiums: vi.fn(),
    getMatchDayRecap: vi.fn(),
    getResultsFilters: vi.fn(),
    getAvailableCupSeasons: vi.fn(),
    getCupRounds: vi.fn(),
    getCupResults: vi.fn(),
    getFriendlyResults: vi.fn()
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
import { LeagueResultsPage } from '../../pages/results/league.js'
import { showGameModal } from '../../partials/gameModal.js'
import { showPlayerModal } from '../../partials/playerModal.js'
import { showTutorialIfNeeded } from '../../partials/tutorialOverlay.js'
import { getQueryParams, setQueryParams } from '../../lib/router.js'

describe('ResultsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getQueryParams.mockReturnValue({})
    server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })
    server.getInjuredPlayers.mockResolvedValue({ injuredPlayers: [] })
    server.getTeamStats.mockResolvedValue({ teamStats: [] })
    server.getLeagueStadiums.mockResolvedValue({ stadiums: [] })
    server.getMatchDayRecap.mockResolvedValue({ recap: null, featuredPlayer: null, featuredTeam: null })
    server.getResultsFilters.mockResolvedValue({
      leagues: [{ level: 0, league: 0 }, { level: 1, league: 0 }, { level: 1, league: 1 }, { level: 2, league: 0 }],
      seasons: [0, 1, 2],
      matchDays: Array.from({ length: 34 }, (_, i) => i + 1)
    })
  })

  describe('ResultsPage tab container', () => {
    it('loads team info from server', async () => {
      const team = testData.team({ level: 1, league: 0 })

      server.getMyTeam.mockResolvedValue({ team, players: [] })

      const page = new ResultsPage()
      await page.load()

      expect(page.myTeamId).toBe(team.id)
    })

    it('template contains tab navigation with league, cup, and friendly', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })

      const page = new ResultsPage()
      await page.load()
      page.subPage = null

      const html = page.template
      expect(html).toContain('results.leagueResults')
      expect(html).toContain('results.cupResults')
      expect(html).toContain('results.friendlyResults')
    })

    it('does not render a Search tab', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })

      const page = new ResultsPage()
      await page.load()
      page.subPage = null

      const html = page.template
      expect(html).not.toContain('#results?sub_page=search')
      expect(html).not.toContain('search.title')
    })

    it('shows tutorial on mount', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })

      const page = new ResultsPage()
      await page.load()
      page.onMounted()

      expect(showTutorialIfNeeded).toHaveBeenCalledWith('results', expect.any(Object))
    })
  })

  describe('query handling', () => {
    it('shows game modal when game_id in query', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 0 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getTopScorers.mockResolvedValue({ topScorers: [] })

      const page = new ResultsPage()
      await page.load()
      await page.onQueryChanged({ game_id: '42' })

      expect(showGameModal).toHaveBeenCalledWith(42)
    })

    it('shows player modal when player_id in query', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 0 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getTopScorers.mockResolvedValue({ topScorers: [] })

      const page = new ResultsPage()
      await page.load()
      await page.onQueryChanged({ player_id: '15' })

      expect(showPlayerModal).toHaveBeenCalledWith(15)
    })

    it('creates LeagueResultsPage for default sub_page', async () => {
      const team = testData.team()

      server.getMyTeam.mockResolvedValue({ team, players: [] })
      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 0 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getTopScorers.mockResolvedValue({ topScorers: [] })

      const page = new ResultsPage()
      await page.load()

      await page.onQueryChanged({})

      expect(page._subPageCache.league).toBeInstanceOf(LeagueResultsPage)
    })
  })

  describe('LeagueResultsPage', () => {
    it('loads results and standing from server', async () => {
      const team = testData.team({ level: 1, league: 0 })
      const results = [
        { id: 1, team1: 'Team A', team2: 'Team B', team1Id: 1, team2Id: 2, goalsTeam1: 2, goalsTeam2: 1 }
      ]
      const standing = [
        { team: { id: 1, name: 'Team A' }, points: 3, goals: 2, against: 1, games: 1 }
      ]

      const parentPage = { myTeamId: team.id, info: { team } }

      server.getCurrentGameday.mockResolvedValue({ season: 1, gameDay: 5 })
      server.getResults.mockResolvedValue({ results })
      server.getStanding.mockResolvedValue(standing)
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()

      expect(leaguePage.results).toEqual(results)
      expect(leaguePage.standing).toEqual(standing)
    })

    it('picks up level/league from URL on first load', async () => {
      // Regression: when navigating to #results?level=3&league=3 from another
      // page, the query-changed event fires while the wrapper is still
      // display:none mid-animation, so UIElement's visibility guard drops
      // the applyQueryParams call. load() must therefore read the URL itself
      // so the user lands on the right league on first paint instead of
      // their own.
      const { getQueryParams } = await import('../../lib/router.js')
      getQueryParams.mockReturnValue({ level: '3', league: '3' })

      const team = testData.team({ level: 1, league: 0 })
      const parentPage = { myTeamId: team.id, info: { team } }

      server.getCurrentGameday.mockResolvedValue({ season: 1, gameDay: 5 })
      server.getResultsFilters.mockResolvedValue({ leagues: [], seasons: [1], matchDays: [1] })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })
      server.getTeamStats.mockResolvedValue({ teamStats: [] })
      server.getInjuredPlayers.mockResolvedValue({ injuredPlayers: [] })
      server.getLeagueStadiums.mockResolvedValue({ stadiums: [] })
      server.getMatchDayRecap.mockResolvedValue(null)

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()

      expect(leaguePage.level).toBe(3)
      expect(leaguePage.league).toBe(3)
      // The standing fetch must use the URL level/league, not the user's team.
      const standingCallArgs = server.getStanding.mock.calls.find(args => args[2] === 3 && args[3] === 3)
      expect(standingCallArgs).toBeDefined()
    })

    it('falls back to user team level/league when URL has none', async () => {
      const { getQueryParams } = await import('../../lib/router.js')
      getQueryParams.mockReturnValue({})

      const team = testData.team({ level: 1, league: 0 })
      const parentPage = { myTeamId: team.id, info: { team } }

      server.getCurrentGameday.mockResolvedValue({ season: 1, gameDay: 5 })
      server.getResultsFilters.mockResolvedValue({ leagues: [], seasons: [1], matchDays: [1] })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })
      server.getTeamStats.mockResolvedValue({ teamStats: [] })
      server.getInjuredPlayers.mockResolvedValue({ injuredPlayers: [] })
      server.getLeagueStadiums.mockResolvedValue({ stadiums: [] })
      server.getMatchDayRecap.mockResolvedValue(null)

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()

      expect(leaguePage.level).toBe(1)
      expect(leaguePage.league).toBe(0)
    })

    it('template contains results and standing sections', async () => {
      const team = testData.team()
      const results = [
        { id: 1, team1: 'Home', team2: 'Away', team1Id: 1, team2Id: 2, goalsTeam1: 1, goalsTeam2: 0 }
      ]
      const standing = [
        { team: { id: 1, name: 'Home' }, points: 3, goals: 1, against: 0, games: 1 }
      ]

      const parentPage = { myTeamId: team.id, info: { team } }

      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 1 })
      server.getResults.mockResolvedValue({ results })
      server.getStanding.mockResolvedValue(standing)
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()

      const html = leaguePage.template
      expect(html).toContain('results.resultsTitle')
      expect(html).toContain('results.standing')
      expect(html).toContain('results.topScorer')
    })

    it('shows played-at date only when games are actually played', async () => {
      const team = testData.team()
      const parentPage = { myTeamId: team.id, info: { team } }
      const playedAt = '2026-04-24T14:00:00Z'

      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 1 })
      server.getStanding.mockResolvedValue([])
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })

      // Upcoming match day: row exists (created_at from season prep) but no goals yet.
      server.getResults.mockResolvedValue({
        results: [
          { id: 1, team1: 'Home', team2: 'Away', team1Id: 1, team2Id: 2, goalsTeam1: null, goalsTeam2: null, created_at: playedAt }
        ]
      })
      const upcomingPage = new LeagueResultsPage(parentPage)
      await upcomingPage.load()
      expect(upcomingPage.template).not.toContain('results.gamesPlayedAt')

      // Played match day: goals present → date is shown.
      server.getResults.mockResolvedValue({
        results: [
          { id: 1, team1: 'Home', team2: 'Away', team1Id: 1, team2Id: 2, goalsTeam1: 1, goalsTeam2: 0, created_at: playedAt }
        ]
      })
      const playedPage = new LeagueResultsPage(parentPage)
      await playedPage.load()
      expect(playedPage.template).toContain('results.gamesPlayedAt')
    })
  })

  describe('filter selects', () => {
    async function setupLeaguePage () {
      const team = testData.team({ level: 1, league: 0 })
      const parentPage = { myTeamId: team.id, info: { team } }

      server.getCurrentGameday.mockResolvedValue({
        season: 2,
        gameDay: 5,
        lastPlayedLeagueSeason: 2,
        lastPlayedLeagueMatchDay: 4
      })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getTopScorers.mockResolvedValue({ topScorers: [] })

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()
      return leaguePage
    }

    it('renders three selects with available filter options', async () => {
      const leaguePage = await setupLeaguePage()
      const html = leaguePage.template

      expect(html).toContain('id="results-league-select"')
      expect(html).toContain('id="results-season-select"')
      expect(html).toContain('id="results-game-day-select"')
      // 4 league options from mock
      expect((html.match(/value="\d+_\d+"/g) || []).length).toBe(4)
      // 3 seasons + 34 game days
      expect((html.match(/<option /g) || []).length).toBe(4 + 3 + 34)
    })

    it('clamps season and match day to last available values when current is invalid', async () => {
      const team = testData.team({ level: 1, league: 0 })
      const parentPage = { myTeamId: team.id, info: { team } }
      server.getCurrentGameday.mockResolvedValue({
        season: 9,
        gameDay: 30,
        lastPlayedLeagueSeason: 9,
        lastPlayedLeagueMatchDay: 30
      })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getResultsFilters
        .mockResolvedValueOnce({ leagues: [{ level: 1, league: 0 }], seasons: [0, 1], matchDays: [] })
        .mockResolvedValueOnce({ leagues: [{ level: 1, league: 0 }], seasons: [0, 1], matchDays: [1, 2, 3] })

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()

      expect(leaguePage.season).toBe(1)
      expect(leaguePage.matchDay).toBe(3)
    })

    it('league select change updates query params with new level/league', async () => {
      const leaguePage = await setupLeaguePage()
      leaguePage.events['#results-league-select'].change({ target: { value: '2_0' } })

      expect(setQueryParams).toHaveBeenCalledWith({
        level: 2,
        league: 0,
        season: leaguePage.season,
        match_day: leaguePage.matchDay
      })
    })

    it('season select change updates season', async () => {
      const leaguePage = await setupLeaguePage()
      leaguePage.events['#results-season-select'].change({ target: { value: '1' } })

      expect(setQueryParams).toHaveBeenCalledWith({ season: 1, match_day: leaguePage.matchDay })
    })

    it('match day select change updates match day', async () => {
      const leaguePage = await setupLeaguePage()
      leaguePage.events['#results-game-day-select'].change({ target: { value: '7' } })

      expect(setQueryParams).toHaveBeenCalledWith({ season: leaguePage.season, match_day: 7 })
    })
  })

  describe('standing rendering', () => {
    it('highlights own team in standing', async () => {
      const team = testData.team({ id: 5 })
      const standing = [
        { team: { id: 5, name: 'My Team', user_id: 1 }, points: 10, goals: 8, against: 3, games: 5 }
      ]

      const parentPage = { myTeamId: 5, info: { team } }

      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 5 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue(standing)
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()

      // Standing row data is returned as an array; row class logic is in the Table config
      const cells = leaguePage._renderStandingListItem(standing[0], 0)
      expect(cells).toBeInstanceOf(Array)
      expect(cells[2]).toContain('My Team')
    })

    it('shows promotion zone for top 2 teams', async () => {
      const team = testData.team({ id: 1 })
      const standing = [
        { team: { id: 2, name: 'Other Team' }, points: 10, goals: 8, against: 3, games: 5 }
      ]

      const parentPage = { myTeamId: 1, info: { team } }

      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 5 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue(standing)
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()

      // Standing row data is returned as an array; row class logic is in the Table config
      const cells = leaguePage._renderStandingListItem(standing[0], 0)
      expect(cells).toBeInstanceOf(Array)
      expect(cells[0]).toBe('1.')
    })

    it('shows relegation zone for bottom teams', async () => {
      const team = testData.team({ id: 1 })
      const standing = [
        { team: { id: 2, name: 'Bottom Team' }, points: 0, goals: 0, against: 10, games: 5 }
      ]

      const parentPage = { myTeamId: 1, info: { team } }

      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 5 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue(standing)
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()

      // Standing row data is returned as an array; row class logic is in the Table config
      const cells = leaguePage._renderStandingListItem(standing[0], 14)
      expect(cells).toBeInstanceOf(Array)
      expect(cells[0]).toBe('15.')
    })
  })

  describe('standing heading for upcoming match day', () => {
    it('shows note and effective match day when selected match day is unplayed', async () => {
      const team = testData.team({ id: 1, level: 1, league: 0 })
      // Standing reflects last played match day (e.g., 20 games per team)
      const standing = [
        { team: { id: 2, name: 'Other' }, points: 30, goals: 25, against: 15, games: 20 },
        { team: { id: 3, name: 'Bottom' }, points: 5, goals: 5, against: 30, games: 20 }
      ]

      const parentPage = { myTeamId: 1, info: { team } }

      server.getCurrentGameday.mockResolvedValue({
        season: 2,
        gameDay: 20,
        lastPlayedLeagueSeason: 2,
        lastPlayedLeagueMatchDay: 20
      })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue(standing)
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()
      // user selects match day 25 (still in the future)
      leaguePage.matchDay = 25
      const html = leaguePage.template

      // Heading reflects the effective (last played) match day, not the selected 25th
      expect(html).toContain('results.standing - 20. results.gameDayLabel')
      // A muted note explains that match day 25 has not been played yet
      expect(html).toContain('results.standingNotPlayedYet')
    })

    it('shows the selected match day in the heading when standing is up to date', async () => {
      const team = testData.team({ id: 1, level: 1, league: 0 })
      const standing = [
        { team: { id: 2, name: 'A' }, points: 30, goals: 25, against: 15, games: 10 }
      ]
      const parentPage = { myTeamId: 1, info: { team } }

      server.getCurrentGameday.mockResolvedValue({
        season: 2,
        gameDay: 10,
        lastPlayedLeagueSeason: 2,
        lastPlayedLeagueMatchDay: 10
      })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue(standing)
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()
      const html = leaguePage.template

      expect(html).toContain('results.standing - 10. results.gameDayLabel')
      expect(html).not.toContain('results.standingNotPlayedYet')
    })
  })

  describe('default season/match day after new season transition', () => {
    it('defaults to the new season and match day 1 when no league game of the new season has been played yet', async () => {
      // Scenario (#385): a new season was created, the first match day has not
      // been played yet. lastPlayedLeagueSeason points to the previous season
      // (e.g. its final match day 34). The page must NOT default to that
      // stale match day — it should open on match day 1 of the upcoming season.
      const team = testData.team({ level: 1, league: 0 })
      const parentPage = { myTeamId: team.id, info: { team } }

      server.getCurrentGameday.mockResolvedValue({
        season: 3,
        gameDay: 1,
        lastPlayedLeagueSeason: 2,
        lastPlayedLeagueMatchDay: 34
      })
      server.getResultsFilters.mockResolvedValue({
        leagues: [{ level: 1, league: 0 }],
        seasons: [0, 1, 2, 3],
        matchDays: Array.from({ length: 34 }, (_, i) => i + 1)
      })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()

      expect(leaguePage.season).toBe(3)
      expect(leaguePage.matchDay).toBe(1)
    })
  })

  describe('applyQueryParams', () => {
    it('resets to last played match day when no season/match_day in query', async () => {
      const team = testData.team({ level: 1, league: 0 })
      const parentPage = { myTeamId: team.id, info: { team } }

      server.getCurrentGameday
        .mockResolvedValueOnce({ season: 2, gameDay: 5, lastPlayedLeagueSeason: 2, lastPlayedLeagueMatchDay: 4 })
        .mockResolvedValueOnce({ season: 2, gameDay: 7, lastPlayedLeagueSeason: 2, lastPlayedLeagueMatchDay: 6 })
      server.getResults.mockResolvedValue({ results: [] })
      server.getStanding.mockResolvedValue([])
      server.getTopScorers.mockResolvedValue({ topScorers: [] })
      server.getSuspendedPlayers.mockResolvedValue({ suspendedPlayers: [] })

      const leaguePage = new LeagueResultsPage(parentPage)
      await leaguePage.load()
      expect(leaguePage.matchDay).toBe(4)

      // user navigates to a specific match day
      getQueryParams.mockReturnValue({ season: '2', match_day: '1' })
      await leaguePage.applyQueryParams({ season: '2', match_day: '1' })
      expect(leaguePage.season).toBe(2)
      expect(leaguePage.matchDay).toBe(1)

      // user navigates away and back without query params -> should reset
      getQueryParams.mockReturnValue({})
      await leaguePage.applyQueryParams({})
      expect(leaguePage.season).toBeUndefined()
      expect(leaguePage.matchDay).toBeUndefined()

      // load() now refetches the latest played match day
      await leaguePage.load()
      expect(leaguePage.matchDay).toBe(6)
      expect(leaguePage.season).toBe(2)
    })
  })

})
