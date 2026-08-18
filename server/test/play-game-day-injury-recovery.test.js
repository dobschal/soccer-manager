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
  getAllMedicalPracticeLevels: vi.fn().mockResolvedValue(new Map()),
  TRAINING_AREA_CARD_CHANCES: { 1: {} },
  FITNESS_STUDIO_CARD_CHANCES: { 0: {} },
  YOUTH_ACADEMY_CARD_CHANCES: { 1: {} },
  MEDICAL_PRACTICE_CARD_CHANCES: { 0: {} }
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
vi.mock('../../client/util/player.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getSalary: vi.fn().mockReturnValue(500)
}))

import { query } from '../lib/database.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { playGameStep } from '../play-game.js'
import { calculateGames } from '../play-game-day.js'

/**
 * A player injured during a game day has not missed a match yet, so the recovery
 * pass at the end of the same cron run must leave them alone. Without that, a
 * one-day injury (a bruise, 30% of all injuries) was inflicted and healed in the
 * same run: the match ticker announced it, but no player ever showed up as
 * injured in the squad list.
 */
describe('play-game-day injury recovery', () => {
  const teamA = { id: 1, name: 'Home FC', user_id: 10, formation: '442a', play_style: 'normal' }
  const teamB = { id: 2, name: 'Away FC', user_id: 20, formation: '442a', play_style: 'normal' }
  const INJURED_PLAYER_ID = 100

  /**
   * @param {number} teamId
   * @returns {object[]}
   */
  function createPlayers (teamId) {
    const positions = ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'DM', 'OM', 'RM', 'LA', 'RA']
    return positions.map((pos, i) => ({
      id: teamId * 100 + i,
      team_id: teamId,
      name: `Player ${teamId}-${i}`,
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

  const leagueGame = {
    id: 42,
    season: 4,
    game_day: 35,
    team_1_id: 1,
    team_2_id: 2,
    played: 0,
    game_type: 'league'
  }

  /** @type {{sql: string, params: any[]}[]} */
  let calls

  beforeEach(() => {
    vi.clearAllMocks()
    calls = []
    getGameDayAndSeason.mockResolvedValue({ gameDay: 35, season: 4 })
    query.mockImplementation(async (sql, params) => {
      calls.push({ sql, params })
      if (sql.includes('game_type=\'league\'') && sql.includes('played=0')) return [leagueGame]
      if (sql.includes('game_type=\'cup\'') && sql.includes('played=0')) return []
      if (sql.includes('SELECT * FROM team WHERE id=?')) {
        if (params[0] === 1) return [teamA]
        if (params[0] === 2) return [teamB]
        return []
      }
      if (sql.includes('SELECT * FROM player WHERE team_id=?') && sql.includes('in_game_position<>')) {
        return createPlayers(params[0])
      }
      if (sql.includes('UPDATE player')) return { affectedRows: 0 }
      if (sql.startsWith('SELECT yellow_cards')) return [{ yellow_cards: 0, red_cards: 0 }]
      return []
    })
  })

  /**
   * @returns {{sql: string, params: any[]}|undefined}
   */
  function decrementCall () {
    return calls.find(c => c.sql.includes('injury_days_left = injury_days_left - 1'))
  }

  it('does not count down an injury that happened on this very game day', async () => {
    playGameStep.mockImplementation((playerTeamA, playerTeamB, gameDetails) => {
      if (gameDetails.injuries) return
      gameDetails.injuries = [{
        playerId: INJURED_PLAYER_ID,
        playerName: 'Player 1-0',
        teamIndex: 0,
        injuryType: 'bruise',
        injuryDays: 1,
        minute: 20
      }]
    })

    await calculateGames()

    // The injury is stored with its full duration ...
    const persisted = calls.find(c => c.sql.includes('SET is_injured=1'))
    expect(persisted).toBeTruthy()
    expect(persisted.params).toEqual(['bruise', 1, INJURED_PLAYER_ID])

    // ... and is not counted down again in the same run.
    const decrement = decrementCall()
    expect(decrement.sql).toContain('AND id NOT IN (?)')
    expect(decrement.params).toEqual([INJURED_PLAYER_ID])
  })

  it('counts down every injured player when nobody got hurt today', async () => {
    playGameStep.mockImplementation(() => {})

    await calculateGames()

    const decrement = decrementCall()
    expect(decrement.sql).not.toContain('NOT IN')
    expect(decrement.params).toEqual([])
  })
})
