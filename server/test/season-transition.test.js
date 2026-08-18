import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateStanding, calculateGamePlan } from '../lib/util.js'

// --- Unit tests for calculateStanding ---

describe('calculateStanding', () => {
  function makeTeam (id, level = 0, league = 0) {
    return { id, name: `Team ${id}`, level, league }
  }

  function makeGame (team1Id, team2Id, goals1, goals2, opts = {}) {
    return {
      team_1_id: team1Id,
      team_2_id: team2Id,
      goals_team_1: goals1,
      goals_team_2: goals2,
      level: opts.level ?? 0,
      league: opts.league ?? 0,
      game_type: opts.game_type ?? 'league',
      played: 1,
      ...opts
    }
  }

  it('calculates correct points for wins, draws, and losses', () => {
    const teams = [makeTeam(1), makeTeam(2), makeTeam(3)]
    const games = [
      makeGame(1, 2, 3, 1), // Team 1 wins
      makeGame(2, 3, 0, 0), // Draw
      makeGame(1, 3, 2, 2) // Draw
    ]

    const standing = calculateStanding(games, teams)

    const team1 = standing.find(s => s.team.id === 1)
    const team2 = standing.find(s => s.team.id === 2)
    const team3 = standing.find(s => s.team.id === 3)

    expect(team1.points).toBe(4) // 3 (win) + 1 (draw)
    expect(team2.points).toBe(1) // 1 (draw)
    expect(team3.points).toBe(2) // 1 (draw) + 1 (draw)
  })

  it('returns standings sorted by points descending', () => {
    const teams = [makeTeam(1), makeTeam(2), makeTeam(3)]
    const games = [
      makeGame(1, 2, 3, 1), // Team 1 wins (3 pts)
      makeGame(3, 1, 2, 0), // Team 3 wins (3 pts)
      makeGame(2, 3, 0, 0) // Draw (1 pt each)
    ]

    const standing = calculateStanding(games, teams)

    // Team 3: 4 pts (win + draw), Team 1: 3 pts (win), Team 2: 1 pt (draw)
    expect(standing[0].team.id).toBe(3)
    expect(standing[0].points).toBe(4)
    expect(standing[1].team.id).toBe(1)
    expect(standing[1].points).toBe(3)
    expect(standing[2].team.id).toBe(2)
    expect(standing[2].points).toBe(1)
  })

  it('uses goal difference as tiebreaker', () => {
    const teams = [makeTeam(1), makeTeam(2)]
    const games = [
      makeGame(1, 2, 3, 0), // Team 1 wins 3-0
      makeGame(2, 1, 1, 0) // Team 2 wins 1-0
    ]

    const standing = calculateStanding(games, teams)

    // Both have 3 points, Team 1 has +2 GD, Team 2 has -2 GD
    expect(standing[0].team.id).toBe(1)
    expect(standing[1].team.id).toBe(2)
  })

  it('tracks goals for and against correctly', () => {
    const teams = [makeTeam(1), makeTeam(2)]
    const games = [
      makeGame(1, 2, 3, 1),
      makeGame(2, 1, 2, 0)
    ]

    const standing = calculateStanding(games, teams)
    const team1 = standing.find(s => s.team.id === 1)
    const team2 = standing.find(s => s.team.id === 2)

    expect(team1.goals).toBe(3) // 3 + 0
    expect(team1.against).toBe(3) // 1 + 2
    expect(team2.goals).toBe(3) // 1 + 2
    expect(team2.against).toBe(3) // 3 + 0
  })

  it('tracks game count correctly', () => {
    const teams = [makeTeam(1), makeTeam(2), makeTeam(3)]
    const games = [
      makeGame(1, 2, 1, 0),
      makeGame(2, 3, 1, 1),
      makeGame(1, 3, 0, 2)
    ]

    const standing = calculateStanding(games, teams)

    expect(standing.find(s => s.team.id === 1).games).toBe(2)
    expect(standing.find(s => s.team.id === 2).games).toBe(2)
    expect(standing.find(s => s.team.id === 3).games).toBe(2)
  })

  it('handles empty games array', () => {
    const teams = [makeTeam(1), makeTeam(2)]
    const standing = calculateStanding([], teams)

    expect(standing).toHaveLength(2)
    expect(standing[0].points).toBe(0)
    expect(standing[1].points).toBe(0)
  })

  it('skips games where team_2_id is null (cup bye games)', () => {
    const teams = [makeTeam(1), makeTeam(2)]
    const games = [
      makeGame(1, 2, 2, 1),
      makeGame(1, null, 0, 0, { game_type: 'cup' }) // bye game
    ]

    // Should not crash - this was the root cause of the original bug
    const standing = calculateStanding(games, teams)
    expect(standing).toHaveLength(2)
    expect(standing.find(s => s.team.id === 1).points).toBe(3)
  })

  it('skips games where team_1_id is not in teams list', () => {
    const teams = [makeTeam(1), makeTeam(2)]
    const games = [
      makeGame(1, 2, 1, 0),
      makeGame(999, 2, 3, 0) // team 999 not in teams list
    ]

    const standing = calculateStanding(games, teams)
    expect(standing).toHaveLength(2)
    // Team 2 should only count the first game (loss)
    expect(standing.find(s => s.team.id === 2).games).toBe(1)
  })

  it('skips games where team_2_id is not in teams list', () => {
    const teams = [makeTeam(1), makeTeam(2)]
    const games = [
      makeGame(1, 2, 1, 0),
      makeGame(1, 888, 2, 0) // team 888 not in teams list
    ]

    const standing = calculateStanding(games, teams)
    expect(standing).toHaveLength(2)
    expect(standing.find(s => s.team.id === 1).games).toBe(1)
  })

  it('counts forfeit games toward games played but awards no points or goals', () => {
    const teams = [makeTeam(1), makeTeam(2), makeTeam(3)]
    const games = [
      makeGame(1, 2, 2, 1), // normal: team 1 wins
      makeGame(2, 3, 0, 0, { is_forfeit: 1 }), // forfeit: counted as a game only
      makeGame(1, 3, 0, 0, { is_forfeit: 1 }) // forfeit: counted as a game only
    ]

    const standing = calculateStanding(games, teams)
    const team1 = standing.find(s => s.team.id === 1)
    const team2 = standing.find(s => s.team.id === 2)
    const team3 = standing.find(s => s.team.id === 3)

    expect(team1.points).toBe(3)
    expect(team1.games).toBe(2) // win vs team 2 + forfeit vs team 3
    expect(team1.goals).toBe(2)
    expect(team1.against).toBe(1)

    expect(team2.points).toBe(0)
    expect(team2.games).toBe(2) // loss vs team 1 + forfeit vs team 3
    expect(team3.points).toBe(0)
    expect(team3.games).toBe(2) // two forfeits
    expect(team3.goals).toBe(0)
    expect(team3.against).toBe(0)
  })

  it('awards 3 points to the winning team on a 3:0 forfeit (opponent short of players)', () => {
    const teams = [makeTeam(1), makeTeam(2)]
    const games = [
      // Team 1 wins by forfeit because team 2 could not field enough players
      makeGame(1, 2, 3, 0, { is_forfeit: 1 })
    ]

    const standing = calculateStanding(games, teams)
    const team1 = standing.find(s => s.team.id === 1)
    const team2 = standing.find(s => s.team.id === 2)

    expect(team1.points).toBe(3)
    expect(team1.wins).toBe(1)
    expect(team1.goals).toBe(3)
    expect(team1.against).toBe(0)
    expect(team2.points).toBe(0)
    expect(team2.losses).toBe(1)
    expect(team2.goals).toBe(0)
    expect(team2.against).toBe(3)
  })

  it('every team has 0 points but full games count when all games are forfeits', () => {
    const teams = Array.from({ length: 18 }, (_, i) => makeTeam(i + 1))
    const games = []
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        games.push(makeGame(teams[i].id, teams[j].id, 0, 0, { is_forfeit: 1 }))
        games.push(makeGame(teams[j].id, teams[i].id, 0, 0, { is_forfeit: 1 }))
      }
    }
    const standing = calculateStanding(games, teams)
    for (const entry of standing) {
      expect(entry.points).toBe(0)
      expect(entry.games).toBe(2 * (teams.length - 1))
      expect(entry.goals).toBe(0)
      expect(entry.against).toBe(0)
    }
  })
})

// --- Tests for full 18-team league season standings ---

describe('full league season standings', () => {
  const teamsPerLeague = 18

  function makeTeam (id) {
    return { id, name: `Team ${id}`, level: 0, league: 0 }
  }

  function simulateFullSeason (teams) {
    const gamePlan = calculateGamePlan(teamsPerLeague)
    const games = []
    let gameDay = 0

    // First half of season
    for (const gamesOfGameday of gamePlan) {
      for (const [t1Index, t2Index] of gamesOfGameday) {
        const teamA = teams[t1Index - 1]
        const teamB = teams[t2Index - 1]
        const goals1 = Math.max(0, (teamA.id % 3))
        const goals2 = Math.max(0, (teamB.id % 3))
        games.push({
          team_1_id: teamA.id,
          team_2_id: teamB.id,
          goals_team_1: goals1,
          goals_team_2: goals2,
          level: 0,
          league: 0,
          game_type: 'league',
          played: 1,
          game_day: gameDay
        })
      }
      gameDay++
    }

    // Second half (reverse fixtures)
    for (const gamesOfGameday of gamePlan) {
      for (const [t1Index, t2Index] of gamesOfGameday) {
        const teamA = teams[t2Index - 1]
        const teamB = teams[t1Index - 1]
        const goals1 = Math.max(0, (teamA.id % 3))
        const goals2 = Math.max(0, (teamB.id % 3))
        games.push({
          team_1_id: teamA.id,
          team_2_id: teamB.id,
          goals_team_1: goals1,
          goals_team_2: goals2,
          level: 0,
          league: 0,
          game_type: 'league',
          played: 1,
          game_day: gameDay
        })
      }
      gameDay++
    }

    return games
  }

  it('produces standings with 18 teams after a full season', () => {
    const teams = Array.from({ length: teamsPerLeague }, (_, i) => makeTeam(i + 1))
    const games = simulateFullSeason(teams)
    const standing = calculateStanding(games, teams)

    expect(standing).toHaveLength(18)
    // Every team should have played 34 games (17 home + 17 away)
    for (const entry of standing) {
      expect(entry.games).toBe(34)
    }
  })

  it('cup games corrupt standings if not filtered out (demonstrates the bug)', () => {
    const teams = Array.from({ length: teamsPerLeague }, (_, i) => makeTeam(i + 1))
    const leagueGames = simulateFullSeason(teams)

    // Cup games that should NOT be part of league standings
    const cupGames = [
      {
        team_1_id: 1,
        team_2_id: 5,
        goals_team_1: 4,
        goals_team_2: 0,
        level: 0,
        league: 0,
        game_type: 'cup',
        played: 1,
        cup_round: 4
      }
    ]

    const standingLeagueOnly = calculateStanding(leagueGames, teams)
    const standingWithCup = calculateStanding([...leagueGames, ...cupGames], teams)

    const team1League = standingLeagueOnly.find(s => s.team.id === 1)
    const team1WithCup = standingWithCup.find(s => s.team.id === 1)

    // Cup game adds extra goals/games, proving cup games corrupt standings if included
    expect(team1WithCup.games).toBeGreaterThan(team1League.games)
  })

  it('top 2 and bottom 4 teams can be identified for promotion/relegation', () => {
    const teams = Array.from({ length: teamsPerLeague }, (_, i) => makeTeam(i + 1))
    const games = simulateFullSeason(teams)
    const standing = calculateStanding(games, teams)

    const promoted = [standing[0].team, standing[1].team]
    expect(promoted).toHaveLength(2)

    const relegated = [
      standing[teamsPerLeague - 1].team,
      standing[teamsPerLeague - 2].team,
      standing[teamsPerLeague - 3].team,
      standing[teamsPerLeague - 4].team
    ]
    expect(relegated).toHaveLength(4)

    const minPromotedPoints = Math.min(standing[0].points, standing[1].points)
    const maxRelegatedPoints = Math.max(
      standing[teamsPerLeague - 1].points,
      standing[teamsPerLeague - 2].points,
      standing[teamsPerLeague - 3].points,
      standing[teamsPerLeague - 4].points
    )
    expect(minPromotedPoints).toBeGreaterThanOrEqual(maxRelegatedPoints)
  })
})

// --- Integration tests for season transition via prepareSeason ---

// Mocks must be at the top level, not inside describe
vi.mock('../lib/database.js', () => ({
  query: vi.fn()
}))
vi.mock('../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn(),
  checkTeamAndNotify: vi.fn()
}))
vi.mock('../helper/teamHelper.js', () => ({
  getTeamById: vi.fn()
}))
vi.mock('../helper/youthPlayerHelper.js', () => ({
  archiveOverageYouthPlayers: vi.fn().mockResolvedValue(0),
  getYouthPlayersAt18: vi.fn().mockResolvedValue([]),
  processYouthTraining: vi.fn()
}))
vi.mock('../i18n/index.js', () => ({
  getUserLocale: vi.fn().mockResolvedValue('en'),
  t: vi.fn((key) => key)
}))
vi.mock('../helper/cupHelper.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createCupDraw: vi.fn().mockResolvedValue(0),
    validateAndProgressCupRounds: vi.fn()
  }
})
vi.mock('../lib/emblem.js', () => ({
  generateRandomEmblem: vi.fn().mockReturnValue({ shape: 'shield', pattern: 'solid', color: '#000', color2: '#fff' })
}))

import { query } from '../lib/database.js'
import { prepareSeason } from '../prepare-season.js'

describe('season transition (prepareSeason)', () => {
  const TEAMS_PER_LEAGUE = 18
  const MIN_TEAMS = 126 // 7 leagues of 18

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeTeam (id, level = 0, league = 0) {
    return { id, name: `Team ${id}`, level, league, is_system_team: 0 }
  }

  function makeLeagueGame (team1Id, team2Id, goals1, goals2, season, gameDay, level = 0, league = 0) {
    return {
      team_1_id: team1Id,
      team_2_id: team2Id,
      goals_team_1: goals1,
      goals_team_2: goals2,
      season,
      game_day: gameDay,
      level,
      league,
      played: 1,
      game_type: 'league'
    }
  }

  /**
   * Create teams distributed across leagues at a single level.
   * Returns { teams, allGames } where teams has exactly count teams
   * and allGames has home/away games for each league.
   */
  function createTeamsAndGames (count, season, level = 0) {
    const teams = []
    const allGames = []
    const leagueCount = Math.ceil(count / TEAMS_PER_LEAGUE)

    for (let lg = 0; lg < leagueCount; lg++) {
      const leagueTeams = []
      for (let i = 0; i < TEAMS_PER_LEAGUE && teams.length < count; i++) {
        const id = teams.length + 1
        const team = makeTeam(id, level, lg)
        teams.push(team)
        leagueTeams.push(team)
      }
      // Generate games for this league
      for (let i = 0; i < leagueTeams.length; i++) {
        for (let j = i + 1; j < leagueTeams.length; j++) {
          allGames.push(makeLeagueGame(
            leagueTeams[i].id, leagueTeams[j].id,
            i % 3, j % 3,
            season, allGames.length % 34,
            level, lg
          ))
          allGames.push(makeLeagueGame(
            leagueTeams[j].id, leagueTeams[i].id,
            j % 3, i % 3,
            season, (allGames.length % 34) + 17,
            level, lg
          ))
        }
      }
    }
    return { teams, allGames }
  }

  /**
   * Smart mock that returns appropriate values based on query string.
   * `unplayedGames` lets a test pretend the season is still running.
   */
  function setupSmartQueryMock (teams, leagueGames, season, { unplayedGames = 0 } = {}) {
    query.mockImplementation((sql) => {
      if (typeof sql !== 'string') return Promise.resolve({ affectedRows: 1 })
      if (sql.includes('COUNT(*)') && sql.includes('played=0')) {
        return Promise.resolve([{ amount: unplayedGames }])
      }
      if (sql.includes('ORDER BY') && sql.includes('season') && sql.includes('LIMIT 1')) {
        return Promise.resolve([{ season }])
      }
      if (sql.includes('SELECT * FROM team WHERE is_system_team')) {
        return Promise.resolve(teams)
      }
      if (sql.includes('SELECT * FROM game WHERE season=')) {
        return Promise.resolve(leagueGames)
      }
      if (sql.includes('FROM app_setting')) {
        return Promise.resolve([])
      }
      if (sql.includes('COUNT(*)')) {
        return Promise.resolve([{ amount: 0 }])
      }
      if (sql.includes('SELECT')) {
        return Promise.resolve([])
      }
      return Promise.resolve({ affectedRows: 1, insertId: 1 })
    })
  }

  it('filters out cup games during promotion/relegation', async () => {
    const season = 0
    const { teams, allGames: leagueGames } = createTeamsAndGames(MIN_TEAMS, season)

    setupSmartQueryMock(teams, leagueGames, season)

    // Should NOT throw (before fix, cup bye games with team_2_id=null crashed here)
    await expect(prepareSeason()).resolves.not.toThrow()

    // Verify the games query used the league filter
    const gamesQueryCall = query.mock.calls.find(
      call => typeof call[0] === 'string' &&
        call[0].includes('SELECT * FROM game WHERE season=') &&
        call[0].includes('game_type')
    )
    expect(gamesQueryCall).toBeDefined()
    expect(gamesQueryCall[0]).toContain("game_type='league'")
  })

  it('_newGamesNeeded only checks league games', async () => {
    const season = 0
    const { teams, allGames: leagueGames } = createTeamsAndGames(MIN_TEAMS, season)

    setupSmartQueryMock(teams, leagueGames, season, { unplayedGames: 5 })

    await prepareSeason()

    // Verify _newGamesNeeded query includes league filter
    const newGamesCall = query.mock.calls.find(
      call => typeof call[0] === 'string' &&
        call[0].includes('COUNT(*)') &&
        call[0].includes('played=0')
    )
    expect(newGamesCall).toBeDefined()
    expect(newGamesCall[0]).toContain('game_type')
  })

  it('promotion/relegation processes multiple levels correctly', async () => {
    // Level 0: 18 teams, Level 1: 36 teams (2 leagues), Level 2: 72 teams (4 leagues)
    // Total: 126 teams
    const season = 0
    const level0Teams = Array.from({ length: 18 }, (_, i) => makeTeam(i + 1, 0, 0))
    const level1Teams = []
    for (let lg = 0; lg < 2; lg++) {
      for (let i = 0; i < 18; i++) {
        level1Teams.push(makeTeam(19 + lg * 18 + i, 1, lg))
      }
    }
    const level2Teams = []
    for (let lg = 0; lg < 4; lg++) {
      for (let i = 0; i < 18; i++) {
        level2Teams.push(makeTeam(55 + lg * 18 + i, 2, lg))
      }
    }
    const allTeams = [...level0Teams, ...level1Teams, ...level2Teams]

    // Generate games per level/league
    function gamesForLeague (leagueTeams, level, league) {
      const games = []
      for (let i = 0; i < leagueTeams.length; i++) {
        for (let j = i + 1; j < leagueTeams.length; j++) {
          games.push(makeLeagueGame(leagueTeams[i].id, leagueTeams[j].id, i % 3, j % 3, season, games.length % 34, level, league))
          games.push(makeLeagueGame(leagueTeams[j].id, leagueTeams[i].id, j % 3, i % 3, season, games.length % 34, level, league))
        }
      }
      return games
    }

    const allGames = [
      ...gamesForLeague(level0Teams, 0, 0),
      ...gamesForLeague(level1Teams.slice(0, 18), 1, 0),
      ...gamesForLeague(level1Teams.slice(18), 1, 1),
      ...gamesForLeague(level2Teams.slice(0, 18), 2, 0),
      ...gamesForLeague(level2Teams.slice(18, 36), 2, 1),
      ...gamesForLeague(level2Teams.slice(36, 54), 2, 2),
      ...gamesForLeague(level2Teams.slice(54), 2, 3)
    ]

    setupSmartQueryMock(allTeams, allGames, season)

    await expect(prepareSeason()).resolves.not.toThrow()

    // Check that UPDATE team SET level=? queries were made (promotion/relegation)
    const levelUpdateCalls = query.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('UPDATE team SET level=')
    )
    // Level 1 teams promoted to level 0 (top 2 per league = 4 teams)
    // Level 0 teams relegated to level 1 (bottom 4)
    // Level 2 teams promoted to level 1 (top 2 per league = 8 teams)
    // Level 1 teams relegated to level 2 (bottom 4 per league = 8 teams)
    expect(levelUpdateCalls.length).toBeGreaterThan(0)
  })

  it('promotion/relegation runs BEFORE _ajustAmountOfTeams so fresh bots can have NULL league', async () => {
    // Regression for the 2026-06-07 prod bug: previously _ajustAmountOfTeams
    // ran first and could create bot teams with league=NULL, which then
    // tripped a guard in _promotionRelegation that bailed with
    // "Relegation and promotion for this season already ran" — skipping
    // the entire season transition.
    const season = 0
    // 126 teams across levels 0..2 (full quotas) so the minimumTeams floor
    // is met and _ajustAmountOfTeams' loop exits immediately. Multi-level
    // setup ensures promotion/relegation actually shifts teams.
    const level0 = Array.from({ length: 18 }, (_, i) => makeTeam(i + 1, 0, 0))
    const level1 = []
    for (let lg = 0; lg < 2; lg++) {
      for (let i = 0; i < 18; i++) level1.push(makeTeam(19 + lg * 18 + i, 1, lg))
    }
    const level2 = []
    for (let lg = 0; lg < 4; lg++) {
      for (let i = 0; i < 18; i++) level2.push(makeTeam(55 + lg * 18 + i, 2, lg))
    }
    const allTeams = [...level0, ...level1, ...level2]
    function gamesForLeague (leagueTeams, level, league) {
      const games = []
      for (let i = 0; i < leagueTeams.length; i++) {
        for (let j = i + 1; j < leagueTeams.length; j++) {
          games.push(makeLeagueGame(leagueTeams[i].id, leagueTeams[j].id, i % 3, j % 3, season, games.length % 34, level, league))
          games.push(makeLeagueGame(leagueTeams[j].id, leagueTeams[i].id, j % 3, i % 3, season, games.length % 34, level, league))
        }
      }
      return games
    }
    const allGames = [
      ...gamesForLeague(level0, 0, 0),
      ...gamesForLeague(level1.slice(0, 18), 1, 0),
      ...gamesForLeague(level1.slice(18), 1, 1),
      ...gamesForLeague(level2.slice(0, 18), 2, 0),
      ...gamesForLeague(level2.slice(18, 36), 2, 1),
      ...gamesForLeague(level2.slice(36, 54), 2, 2),
      ...gamesForLeague(level2.slice(54), 2, 3)
    ]

    setupSmartQueryMock(allTeams, allGames, season)

    await prepareSeason()

    const promotionGamesQueryIndex = query.mock.calls.findIndex(call =>
      typeof call[0] === 'string' &&
      call[0].includes('SELECT * FROM game WHERE season=?') &&
      call[0].includes('game_type')
    )
    // The team SELECT made by _ajustAmountOfTeams must come AFTER the
    // promotion games query — otherwise we're back in the buggy ordering.
    const ajustTeamQueryIndex = query.mock.calls.findIndex((call, idx) =>
      typeof call[0] === 'string' &&
      call[0] === 'SELECT * FROM team WHERE is_system_team = 0' &&
      idx > promotionGamesQueryIndex
    )
    expect(promotionGamesQueryIndex).toBeGreaterThanOrEqual(0)
    expect(ajustTeamQueryIndex).toBeGreaterThan(promotionGamesQueryIndex)
    // And the promotion actually ran: at least one level update.
    expect(query.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('UPDATE team SET level=')
    ).length).toBeGreaterThan(0)
  })

  it('skips promotion/relegation when last_promoted_season flag covers the current season', async () => {
    const season = 3
    const { teams, allGames } = createTeamsAndGames(MIN_TEAMS, season)

    query.mockImplementation((sql) => {
      if (typeof sql !== 'string') return Promise.resolve({ affectedRows: 1 })
      if (sql.includes('COUNT(*)') && sql.includes('played=0')) {
        return Promise.resolve([{ amount: 0 }])
      }
      if (sql.includes('ORDER BY') && sql.includes('season') && sql.includes('LIMIT 1')) {
        return Promise.resolve([{ season }])
      }
      if (sql.includes('SELECT * FROM team WHERE is_system_team')) {
        return Promise.resolve(teams)
      }
      if (sql.includes('SELECT * FROM game WHERE season=')) {
        return Promise.resolve(allGames)
      }
      if (sql.includes('FROM app_setting')) {
        return Promise.resolve([{ setting_value: String(season) }])
      }
      if (sql.includes('COUNT(*)')) return Promise.resolve([{ amount: 0 }])
      if (sql.includes('SELECT')) return Promise.resolve([])
      return Promise.resolve({ affectedRows: 1, insertId: 1 })
    })

    await prepareSeason()

    // No level updates should happen — the flag short-circuits the function.
    const levelUpdateCalls = query.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('UPDATE team SET level=')
    )
    expect(levelUpdateCalls).toHaveLength(0)
  })

  describe('_archiveTooOldPlayers gating', () => {
    // Regression for mid-season retirement bug: on the cron tick right after
    // _createGamesForNewSeason bumped _latestSeason() from N to N+1, the
    // unguarded _archiveTooOldPlayers retired the entire carrier_end_season=N+1
    // cohort before they ever played a season-N+1 game. Fix: only run when
    // no unplayed league games exist (i.e. genuine season transition).

    it('does NOT retire players mid-season (unplayed games remain)', async () => {
      const season = 5
      const { teams, allGames } = createTeamsAndGames(MIN_TEAMS, season)
      // unplayedGames > 0 → still in the middle of a season; retirement must skip.
      setupSmartQueryMock(teams, allGames, season, { unplayedGames: 100 })

      await prepareSeason()

      const retirementUpdates = query.mock.calls.filter(call =>
        typeof call[0] === 'string' &&
        call[0].includes('SET is_retired=1')
      )
      const retirementSelects = query.mock.calls.filter(call =>
        typeof call[0] === 'string' &&
        call[0].includes('SELECT * FROM player WHERE carrier_end_season')
      )
      expect(retirementUpdates).toHaveLength(0)
      expect(retirementSelects).toHaveLength(0)
    })

    it('retires players at the season transition (no unplayed games)', async () => {
      const season = 5
      const { teams, allGames } = createTeamsAndGames(MIN_TEAMS, season)
      const retiringPlayers = [
        { id: 101, name: 'Retiree A', team_id: 1, carrier_end_season: 5 },
        { id: 102, name: 'Retiree B', team_id: 2, carrier_end_season: 4 },
        // A player whose career ends while he is already a free agent. The run
        // used to skip these entirely (`team_id IS NOT NULL`), so their open
        // transfer offers were never deleted and nothing marked them retired (#556).
        { id: 103, name: 'Unemployed Retiree', team_id: null, carrier_end_season: 5 }
      ]

      query.mockImplementation((sql) => {
        if (typeof sql !== 'string') return Promise.resolve({ affectedRows: 1 })
        if (sql.includes('COUNT(*)') && sql.includes('played=0')) {
          return Promise.resolve([{ amount: 0 }])
        }
        if (sql.includes('ORDER BY') && sql.includes('season') && sql.includes('LIMIT 1')) {
          return Promise.resolve([{ season }])
        }
        if (sql.includes('SELECT * FROM player WHERE carrier_end_season')) {
          return Promise.resolve(retiringPlayers)
        }
        if (sql.includes('SELECT * FROM team WHERE is_system_team')) {
          return Promise.resolve(teams)
        }
        if (sql.includes('SELECT * FROM game WHERE season=')) {
          return Promise.resolve(allGames)
        }
        if (sql.includes('FROM app_setting')) return Promise.resolve([])
        if (sql.includes('COUNT(*)')) return Promise.resolve([{ amount: 0 }])
        if (sql.includes('SELECT')) return Promise.resolve([])
        return Promise.resolve({ affectedRows: 1, insertId: 1 })
      })

      await prepareSeason()

      // The cohort is selected by the flag, not by having a club, so a player who
      // reaches his career end unemployed is retired along with the rest.
      const retirementSelect = query.mock.calls.find(call =>
        typeof call[0] === 'string' &&
        call[0].startsWith('SELECT * FROM player WHERE carrier_end_season')
      )
      expect(retirementSelect[0]).toContain('is_retired=0')
      expect(retirementSelect[0]).not.toContain('team_id IS NOT NULL')

      const retirementUpdate = query.mock.calls.find(call =>
        typeof call[0] === 'string' &&
        call[0].includes('SET is_retired=1')
      )
      expect(retirementUpdate).toBeDefined()
      expect(retirementUpdate[1]).toEqual([[101, 102, 103]])
      // Everything that could put a retired player back in front of a user is
      // cleared in the same sweep: club, lineup slot, bench slot and tour.
      expect(retirementUpdate[0]).toContain('team_id=NULL')
      expect(retirementUpdate[0]).toContain("in_game_position=''")
      expect(retirementUpdate[0]).toContain('bench_position=NULL')
      expect(retirementUpdate[0]).toContain('tour_days_left=0')

      // Retired players' open trade_offers get wiped — otherwise they'd linger
      // on the transfer market as unbuyable ghosts.
      const offerDelete = query.mock.calls.find(call =>
        typeof call[0] === 'string' &&
        call[0].startsWith('DELETE FROM trade_offer WHERE player_id IN')
      )
      expect(offerDelete).toBeDefined()
      expect(offerDelete[1]).toEqual([[101, 102, 103]])
    })
  })
})
