import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/database.js', () => ({ query: vi.fn() }))
vi.mock('../helper/financeHelper.js', () => ({ updateTeamBalance: vi.fn() }))
vi.mock('../helper/gameDayHelper.js', () => ({ getGameDayAndSeason: vi.fn() }))
vi.mock('../helper/sponsorHelper.js', () => ({ getSponsor: vi.fn().mockResolvedValue({ sponsor: null }) }))
vi.mock('../helper/stadiumHelper.js', () => ({ completeStadiumConstructions: vi.fn() }))
vi.mock('../helper/buildingHelper.js', () => ({
  completeBuildingConstructions: vi.fn(),
  getAllTrainingAreaLevels: vi.fn().mockResolvedValue(new Map()),
  getAllFitnessStudioLevels: vi.fn().mockResolvedValue(new Map()),
  getAllYouthAcademyLevels: vi.fn().mockResolvedValue(new Map()),
  TRAINING_AREA_CARD_CHANCES: { 1: {} },
  FITNESS_STUDIO_CARD_CHANCES: { 0: {} },
  YOUTH_ACADEMY_CARD_CHANCES: { 0: {} }
}))
vi.mock('../helper/logMessageHelper.js', () => ({ addLogMessage: vi.fn(), checkTeamAndNotify: vi.fn() }))
vi.mock('../i18n/index.js', () => ({
  getUserLocale: vi.fn().mockResolvedValue('en'),
  t: vi.fn((key) => key)
}))
vi.mock('../helper/youthPlayerHelper.js', () => ({ processYouthTraining: vi.fn() }))
vi.mock('../helper/standingHelper.js', () => ({ cacheStandingsForGameDay: vi.fn() }))
vi.mock('../helper/teamStatsHelper.js', () => ({ cacheTeamStatsForGameDay: vi.fn() }))
vi.mock('../helper/playerStatsHelper.js', () => ({ cachePlayerStatsForGameDay: vi.fn() }))
vi.mock('../helper/actionCardHelper.js', () => ({
  actionCardChances: {},
  deleteExpiredPendingCards: vi.fn()
}))
vi.mock('../helper/matchDayRecapHelper.js', () => ({ generateMatchDayRecapsForGameDay: vi.fn() }))
vi.mock('../helper/seasonTitleHelper.js', () => ({
  recordCupWinnerForSeason: vi.fn(),
  recordLeagueChampionsForSeason: vi.fn()
}))
vi.mock('../helper/pushNotificationHelper.js', () => ({ sendGameDayPushNotifications: vi.fn() }))
vi.mock('../helper/captainHelper.js', () => ({ getCaptainStrengthMultiplier: vi.fn().mockReturnValue(1) }))
vi.mock('../lib/cache.js', () => ({
  CACHE_NAMESPACES: { SEASON_RESULTS: 'season_results' },
  clearCacheByPrefix: vi.fn()
}))
vi.mock('../helper/cupHelper.js', () => ({
  progressCupRound: vi.fn().mockResolvedValue({ advanced: false, isComplete: false }),
  sendCupMatchLogMessages: vi.fn(),
  validateAndProgressCupRounds: vi.fn()
}))
vi.mock('../play-game.js', () => ({ kickoff: vi.fn(), playGameStep: vi.fn() }))
vi.mock('../helper/playerHelper.js', () => ({ getPlayerAge: vi.fn().mockResolvedValue(25) }))
vi.mock('../../client/util/player.js', () => ({ getSalary: vi.fn().mockReturnValue(500) }))

import { query } from '../lib/database.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { calculateGames } from '../play-game-day.js'

describe('play-game-day forfeit when a team has no fielded players', () => {
  const teamA = { id: 1, name: 'Home FC', user_id: 10, formation: '442a', play_style: 'normal' }
  const teamB = { id: 2, name: 'Empty FC', user_id: null, formation: '442a', play_style: 'normal' }

  function createPlayers (teamId, count = 11) {
    const positions = ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'DM', 'OM', 'RM', 'LA', 'RA']
    return positions.slice(0, count).map((pos, i) => ({
      id: teamId * 100 + i,
      team_id: teamId,
      level: 50,
      freshness: 1.0,
      in_game_position: pos,
      position: pos,
      is_suspended: 0,
      is_injured: 0,
      is_star_player: 0,
      yellow_cards: 0,
      red_cards: 0
    }))
  }

  const playersA = createPlayers(1)

  let lastGameUpdate = null

  beforeEach(() => {
    vi.clearAllMocks()
    lastGameUpdate = null
    getGameDayAndSeason.mockResolvedValue({ gameDay: 35, season: 4 })
  })

  function setupMocks ({ leagueGames = [], cupGames = [], teamBPlayers = [], teamBBench = [] } = {}) {
    query.mockImplementation(async (sql, params) => {
      if (sql.includes('game_type=\'league\'') && sql.includes('played=0')) return leagueGames
      if (sql.includes('game_type=\'cup\'') && sql.includes('played=0')) return cupGames
      if (sql.includes('SELECT * FROM team WHERE id=?')) {
        if (params[0] === 1) return [teamA]
        if (params[0] === 2) return [teamB]
        return []
      }
      // Lineup query: team_id=? AND in_game_position<>'' AND in_game_position IS NOT NULL
      if (sql.includes('SELECT * FROM player WHERE team_id=?') && sql.includes('in_game_position<>')) {
        if (params[0] === 1) return playersA.map(p => ({ ...p }))
        if (params[0] === 2) return teamBPlayers
        return []
      }
      // Bench query for auto-fill: in_game_position IS NULL/empty, not suspended, not injured
      if (sql.includes('SELECT * FROM player WHERE team_id=?') && sql.includes('is_suspended=0') && sql.includes('is_injured=0')) {
        if (params[0] === 1) return []
        if (params[0] === 2) return teamBBench
        return []
      }
      if (sql.includes('UPDATE player')) return { affectedRows: 0 }
      // Capture the forfeit update on the game row
      if (sql.startsWith('UPDATE game SET played=1, is_forfeit=1')) {
        lastGameUpdate = { sql, params }
        return { affectedRows: 1 }
      }
      if (sql.includes('UPDATE game SET details=?')) {
        lastGameUpdate = { sql, params }
        return { affectedRows: 1 }
      }
      if (sql.includes('SELECT * FROM stadium WHERE team_id=?')) return []
      if (sql.includes('SELECT * FROM player WHERE freshness')) return []
      if (sql.includes('SELECT * FROM team')) return []
      if (sql.includes('SELECT * FROM player WHERE team_ID=?')) return []
      return []
    })
  }

  it('forfeits a league game 3:0 when the away team can field no players', async () => {
    const leagueGame = {
      id: 13287,
      season: 4,
      game_day: 35,
      team_1_id: 1,
      team_2_id: 2,
      played: 0,
      game_type: 'league'
    }
    setupMocks({ leagueGames: [leagueGame], teamBPlayers: [], teamBBench: [] })

    await calculateGames()

    expect(lastGameUpdate).not.toBeNull()
    expect(lastGameUpdate.sql).toMatch(/UPDATE game SET played=1, is_forfeit=1/)
    const [goals1, goals2, , , id] = lastGameUpdate.params
    expect(goals1).toBe(3)
    expect(goals2).toBe(0)
    expect(id).toBe(13287)
  })

  it('forfeits a league game 0:3 when the home team can field no players', async () => {
    const leagueGame = {
      id: 555,
      season: 4,
      game_day: 35,
      team_1_id: 2, // empty team at home
      team_2_id: 1,
      played: 0,
      game_type: 'league'
    }
    setupMocks({ leagueGames: [leagueGame], teamBPlayers: [], teamBBench: [] })

    await calculateGames()

    expect(lastGameUpdate.sql).toMatch(/UPDATE game SET played=1, is_forfeit=1/)
    const [goals1, goals2] = lastGameUpdate.params
    expect(goals1).toBe(0)
    expect(goals2).toBe(3)
  })

  it('forfeits a cup game 3:0 when the away team can field no players', async () => {
    const cupGame = {
      id: 999,
      season: 4,
      game_day: 35,
      team_1_id: 1,
      team_2_id: 2,
      played: 0,
      game_type: 'cup',
      cup_round: 4
    }
    setupMocks({ cupGames: [cupGame], teamBPlayers: [], teamBBench: [] })

    await calculateGames()

    expect(lastGameUpdate.sql).toMatch(/UPDATE game SET played=1, is_forfeit=1/)
    const [goals1, goals2] = lastGameUpdate.params
    expect(goals1).toBe(3)
    expect(goals2).toBe(0)
  })

  it('forfeits a league game 3:0 when the away team can only field 6 players', async () => {
    const leagueGame = {
      id: 7777,
      season: 4,
      game_day: 35,
      team_1_id: 1,
      team_2_id: 2,
      played: 0,
      game_type: 'league'
    }
    // 6 players assigned to lineup, no bench to fill the rest → final lineup = 6
    setupMocks({
      leagueGames: [leagueGame],
      teamBPlayers: createPlayers(2, 6),
      teamBBench: []
    })

    await calculateGames()

    expect(lastGameUpdate).not.toBeNull()
    expect(lastGameUpdate.sql).toMatch(/UPDATE game SET played=1, is_forfeit=1/)
    const [goals1, goals2, , , id] = lastGameUpdate.params
    expect(goals1).toBe(3)
    expect(goals2).toBe(0)
    expect(id).toBe(7777)
  })

  it('plays a league game normally when the away team has exactly 7 players', async () => {
    const leagueGame = {
      id: 7778,
      season: 4,
      game_day: 35,
      team_1_id: 1,
      team_2_id: 2,
      played: 0,
      game_type: 'league'
    }
    setupMocks({
      leagueGames: [leagueGame],
      teamBPlayers: createPlayers(2, 7),
      teamBBench: []
    })

    await calculateGames()

    // Game should NOT be forfeited — no is_forfeit=1 UPDATE captured
    expect(lastGameUpdate?.sql ?? '').not.toMatch(/is_forfeit=1/)
  })

  it('records 0:0 when both teams are below the minimum', async () => {
    const leagueGame = {
      id: 7779,
      season: 4,
      game_day: 35,
      team_1_id: 2,
      team_2_id: 2, // both refer to the empty team to simplify lineup mocking
      played: 0,
      game_type: 'league'
    }
    // Override team 1 lookup for this test to also return the empty team
    query.mockImplementation(async (sql, params) => {
      if (sql.includes('game_type=\'league\'') && sql.includes('played=0')) return [leagueGame]
      if (sql.includes('game_type=\'cup\'') && sql.includes('played=0')) return []
      if (sql.includes('SELECT * FROM team WHERE id=?')) return [teamB]
      if (sql.includes('SELECT * FROM player WHERE team_id=?') && sql.includes('in_game_position<>')) return []
      if (sql.includes('SELECT * FROM player WHERE team_id=?') && sql.includes('is_suspended=0')) return []
      if (sql.includes('UPDATE player')) return { affectedRows: 0 }
      if (sql.startsWith('UPDATE game SET played=1, is_forfeit=1')) {
        lastGameUpdate = { sql, params }
        return { affectedRows: 1 }
      }
      return []
    })

    await calculateGames()

    expect(lastGameUpdate).not.toBeNull()
    const [goals1, goals2] = lastGameUpdate.params
    expect(goals1).toBe(0)
    expect(goals2).toBe(0)
  })
})
