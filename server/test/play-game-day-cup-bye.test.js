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
  progressCupRound: vi.fn().mockResolvedValue({ advanced: true, isComplete: false }),
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
import { progressCupRound } from '../helper/cupHelper.js'
import { calculateGames } from '../play-game-day.js'

/**
 * Byes are drawn together with the first round but must not count as played
 * until the round's game day is actually reached — `created_at` doubles as the
 * "played at" date on the dashboard, so an early stamp shows a finished match
 * days before the round happened.
 */
describe('play-game-day cup byes', () => {
  const byeGame = {
    id: 51169,
    season: 9,
    game_day: 4,
    team_1_id: 86,
    team_2_id: null,
    played: 0,
    game_type: 'cup',
    cup_round: 256
  }

  let byeUpdate = null
  let simulationUpdates = []

  beforeEach(() => {
    vi.clearAllMocks()
    byeUpdate = null
    simulationUpdates = []
    getGameDayAndSeason.mockResolvedValue({ gameDay: 4, season: 9 })
  })

  function setupMocks (cupGames) {
    query.mockImplementation(async (sql) => {
      if (sql.includes('game_type=\'league\'') && sql.includes('played=0')) return []
      if (sql.includes('game_type=\'cup\'') && sql.includes('played=0')) return cupGames
      if (sql.startsWith('UPDATE game SET played=1, goals_team_1=0, goals_team_2=0, created_at=?')) {
        byeUpdate = sql
        return { affectedRows: cupGames.length }
      }
      if (sql.includes('UPDATE game SET details=?')) {
        simulationUpdates.push(sql)
        return { affectedRows: 1 }
      }
      if (sql.startsWith('UPDATE game SET played=1, is_forfeit=1')) {
        simulationUpdates.push(sql)
        return { affectedRows: 1 }
      }
      if (sql.includes('UPDATE player')) return { affectedRows: 0 }
      return []
    })
  }

  it('stamps a bye 0:0 with the current time when its round is played', async () => {
    setupMocks([{ ...byeGame }])

    await calculateGames({ skipPushNotifications: true })

    const call = query.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE game SET played=1, goals_team_1=0, goals_team_2=0, created_at=?')
    )
    expect(call).toBeDefined()
    const [playedAt, ...ids] = call[1]
    expect(ids).toEqual([51169])
    expect(playedAt).toBeInstanceOf(Date)
    expect(Date.now() - playedAt.getTime()).toBeLessThan(60_000)
  })

  it('does not run a bye through the match simulation', async () => {
    setupMocks([{ ...byeGame }])

    await calculateGames({ skipPushNotifications: true })

    expect(byeUpdate).not.toBeNull()
    expect(simulationUpdates).toEqual([])
  })

  it('progresses the round the byes belong to', async () => {
    setupMocks([{ ...byeGame }])

    await calculateGames({ skipPushNotifications: true })

    expect(progressCupRound).toHaveBeenCalledWith(9, 256)
  })

  it('resolves all byes of the game day in a single update', async () => {
    setupMocks([
      { ...byeGame, id: 1 },
      { ...byeGame, id: 2 },
      { ...byeGame, id: 3 }
    ])

    await calculateGames({ skipPushNotifications: true })

    const calls = query.mock.calls.filter(([sql]) =>
      sql.startsWith('UPDATE game SET played=1, goals_team_1=0, goals_team_2=0, created_at=?')
    )
    expect(calls.length).toBe(1)
    expect(calls[0][0]).toContain('WHERE id IN (?,?,?)')
    expect(calls[0][1].slice(1)).toEqual([1, 2, 3])
  })

  it('issues no update when the game day has no byes', async () => {
    setupMocks([])

    await calculateGames({ skipPushNotifications: true })

    expect(byeUpdate).toBeNull()
  })
})
