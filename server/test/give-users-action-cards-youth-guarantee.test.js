import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/database.js', () => ({ query: vi.fn() }))
vi.mock('../helper/gameDayHelper.js', () => ({ getGameDayAndSeason: vi.fn() }))
// Empty overrides so the default chances from actionCardChances apply unchanged.
vi.mock('../helper/buildingHelper.js', () => ({
  completeBuildingConstructions: vi.fn(),
  getAllTrainingAreaLevels: vi.fn(),
  getAllFitnessStudioLevels: vi.fn(),
  getAllYouthAcademyLevels: vi.fn(),
  TRAINING_AREA_CARD_CHANCES: { 0: {}, 1: {} },
  FITNESS_STUDIO_CARD_CHANCES: { 0: {}, 1: {} },
  YOUTH_ACADEMY_CARD_CHANCES: { 0: {}, 1: {} },
  YOUTH_ACADEMY_GUARANTEED_CARD: {
    1: 'NEW_YOUTH_PLAYER_1',
    2: 'NEW_YOUTH_PLAYER_2',
    3: 'NEW_YOUTH_PLAYER_3'
  }
}))
// All youth chances 0 so the guarantee rule is the sole driver for youth cards.
// FILLER = 1 guarantees the while-loop exits each day (mirrors prod where LEVEL_UP_PLAYER_40 is 1.2).
// Individual tests mutate actionCardChances.NEW_YOUTH_PLAYER_* to exercise the per-season cap.
vi.mock('../helper/actionCardHelper.js', () => ({
  actionCardChances: { FILLER: 1, NEW_YOUTH_PLAYER_1: 0, NEW_YOUTH_PLAYER_2: 0, NEW_YOUTH_PLAYER_3: 0 },
  deleteExpiredPendingCards: vi.fn(),
  NEW_YOUTH_PLAYER_ACTIONS: new Set(['NEW_YOUTH_PLAYER_1', 'NEW_YOUTH_PLAYER_2', 'NEW_YOUTH_PLAYER_3']),
  MAX_YOUTH_CARDS_PER_SEASON: 3,
  MAX_ACTION_CARDS_PER_TYPE: 20
}))
vi.mock('../helper/financeHelper.js', () => ({ updateTeamBalance: vi.fn() }))
vi.mock('../helper/sponsorHelper.js', () => ({ getSponsor: vi.fn() }))
vi.mock('../helper/stadiumHelper.js', () => ({ completeStadiumConstructions: vi.fn() }))
vi.mock('../helper/logMessageHelper.js', () => ({ addLogMessage: vi.fn(), checkTeamAndNotify: vi.fn() }))
vi.mock('../i18n/index.js', () => ({ getUserLocale: vi.fn().mockResolvedValue('en'), t: vi.fn(k => k) }))
vi.mock('../helper/youthPlayerHelper.js', () => ({ processYouthTraining: vi.fn() }))
vi.mock('../helper/standingHelper.js', () => ({ cacheStandingsForGameDay: vi.fn() }))
vi.mock('../helper/teamStatsHelper.js', () => ({ cacheTeamStatsForGameDay: vi.fn() }))
vi.mock('../helper/playerStatsHelper.js', () => ({ cachePlayerStatsForGameDay: vi.fn() }))
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
  progressCupRound: vi.fn(),
  sendCupMatchLogMessages: vi.fn(),
  validateAndProgressCupRounds: vi.fn()
}))
vi.mock('../play-game.js', () => ({ kickoff: vi.fn(), playGameStep: vi.fn() }))
vi.mock('../helper/playerHelper.js', () => ({ getPlayerAge: vi.fn() }))
vi.mock('../../client/util/player.js', () => ({ getSalary: vi.fn() }))
vi.mock('../helper/lineupHelper.js', () => ({ autoFillLineup: vi.fn(), trimExcessLineup: vi.fn() }))

import { query } from '../lib/database.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getAllTrainingAreaLevels, getAllFitnessStudioLevels, getAllYouthAcademyLevels } from '../helper/buildingHelper.js'
import { actionCardChances } from '../helper/actionCardHelper.js'
import { _giveUsersActionCards } from '../play-game-day.js'

describe('_giveUsersActionCards - guaranteed youth player card', () => {
  const SEASON = 7

  /**
   * Builds a query mock with configurable team list, youth_player ownership,
   * and previously received NEW_YOUTH_PLAYER cards this season.
   *
   * @param {object} opts
   * @param {Array<{id:number}>} opts.teams
   * @param {number[]} opts.teamIdsWithYouth team ids that currently own a youth_player
   * @param {number[]} [opts.teamIdsWithYouthCardThisSeason] team ids that already received exactly one NEW_YOUTH_PLAYER card this season
   * @param {Object<number, number>} [opts.youthCardCounts] explicit per-team count of youth cards already received this season (overrides the array form)
   */
  function setupMocks ({ teams, teamIdsWithYouth, teamIdsWithYouthCardThisSeason = [], youthCardCounts, heldCounts = [] }) {
    // Normalise both input shapes into a single teamId -> count map.
    const counts = youthCardCounts
      ? new Map(Object.entries(youthCardCounts).map(([id, cnt]) => [Number(id), cnt]))
      : new Map(teamIdsWithYouthCardThisSeason.map(id => [id, 1]))
    /** @type {Array<{sql:string, params:any, value:any}>} */
    const inserts = []
    query.mockImplementation(async (sql, params) => {
      if (sql.startsWith('SELECT * FROM team')) return teams
      if (sql.startsWith('SELECT DISTINCT team_id FROM youth_player')) {
        return teamIdsWithYouth.map(team_id => ({ team_id }))
      }
      if (sql.startsWith('SELECT team_id, COUNT(*) AS cnt FROM action_card WHERE action IN')) {
        return [...counts.entries()].map(([team_id, cnt]) => ({ team_id, cnt }))
      }
      // Held-or-pending counts per (team, action) used to skip cards that would
      // exceed MAX_ACTION_CARDS_PER_TYPE. Tests pass rows explicitly.
      if (sql.startsWith('SELECT team_id, action, COUNT(*) AS cnt FROM action_card WHERE played=0')) {
        return heldCounts
      }
      if (sql.startsWith('INSERT INTO action_card')) {
        inserts.push({ sql, params, value: params })
        return { insertId: inserts.length }
      }
      return []
    })
    return inserts
  }

  const YOUTH_ACTIONS = new Set(['NEW_YOUTH_PLAYER_1', 'NEW_YOUTH_PLAYER_2', 'NEW_YOUTH_PLAYER_3'])

  beforeEach(() => {
    vi.clearAllMocks()
    getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: SEASON })
    getAllTrainingAreaLevels.mockResolvedValue(new Map())
    getAllFitnessStudioLevels.mockResolvedValue(new Map())
    getAllYouthAcademyLevels.mockResolvedValue(new Map())
    // Reset the chances mutated by the per-season cap / hold-limit tests.
    actionCardChances.NEW_YOUTH_PLAYER_1 = 0
    actionCardChances.NEW_YOUTH_PLAYER_2 = 0
    actionCardChances.NEW_YOUTH_PLAYER_3 = 0
    actionCardChances.FILLER = 1
  })

  it('guarantees a NEW_YOUTH_PLAYER_1 card for a team with no youth player and no youth card this season', async () => {
    const inserts = setupMocks({
      teams: [{ id: 42 }],
      teamIdsWithYouth: [],
      teamIdsWithYouthCardThisSeason: []
    })

    await _giveUsersActionCards()

    const youthInserts = inserts.filter(i => YOUTH_ACTIONS.has(i.value.action))
    expect(youthInserts).toHaveLength(1)
    expect(youthInserts[0].value).toMatchObject({
      team_id: 42,
      action: 'NEW_YOUTH_PLAYER_1',
      played: 0,
      state: 'pending',
      season: SEASON
    })
  })

  it('guarantees a Silver (NEW_YOUTH_PLAYER_2) card for a level-2 youth academy', async () => {
    getAllYouthAcademyLevels.mockResolvedValue(new Map([[42, 2]]))
    const inserts = setupMocks({
      teams: [{ id: 42 }],
      teamIdsWithYouth: [],
      teamIdsWithYouthCardThisSeason: []
    })

    await _giveUsersActionCards()

    const youthInserts = inserts.filter(i => YOUTH_ACTIONS.has(i.value.action))
    expect(youthInserts).toHaveLength(1)
    expect(youthInserts[0].value.action).toBe('NEW_YOUTH_PLAYER_2')
  })

  it('guarantees a Gold (NEW_YOUTH_PLAYER_3) card for a level-3 youth academy', async () => {
    getAllYouthAcademyLevels.mockResolvedValue(new Map([[42, 3]]))
    const inserts = setupMocks({
      teams: [{ id: 42 }],
      teamIdsWithYouth: [],
      teamIdsWithYouthCardThisSeason: []
    })

    await _giveUsersActionCards()

    const youthInserts = inserts.filter(i => YOUTH_ACTIONS.has(i.value.action))
    expect(youthInserts).toHaveLength(1)
    expect(youthInserts[0].value.action).toBe('NEW_YOUTH_PLAYER_3')
  })

  it('does not give a youth card when the team already owns a youth player', async () => {
    const inserts = setupMocks({
      teams: [{ id: 1 }],
      teamIdsWithYouth: [1],
      teamIdsWithYouthCardThisSeason: []
    })

    await _giveUsersActionCards()

    const youthInserts = inserts.filter(i => YOUTH_ACTIONS.has(i.value.action))
    expect(youthInserts).toHaveLength(0)
  })

  it('does not give a youth card when the team already received one this season', async () => {
    const inserts = setupMocks({
      teams: [{ id: 1 }],
      teamIdsWithYouth: [],
      teamIdsWithYouthCardThisSeason: [1]
    })

    await _giveUsersActionCards()

    const youthInserts = inserts.filter(i => YOUTH_ACTIONS.has(i.value.action))
    expect(youthInserts).toHaveLength(0)
  })

  it('only guarantees cards for the eligible subset when multiple teams are mixed', async () => {
    const inserts = setupMocks({
      teams: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      teamIdsWithYouth: [2], // team 2 has a youth player
      teamIdsWithYouthCardThisSeason: [3] // team 3 already got a card this season
    })

    await _giveUsersActionCards()

    const youthInserts = inserts.filter(i => YOUTH_ACTIONS.has(i.value.action))
    const guaranteedTeamIds = youthInserts.map(i => i.value.team_id).sort()
    expect(guaranteedTeamIds).toEqual([1, 4])
  })

  describe('per-season youth card cap (MAX_YOUTH_CARDS_PER_SEASON = 3)', () => {
    it('caps a single game day so the season total never exceeds 3', async () => {
      // Team owns a youth player (no guarantee) and would otherwise get 5 youth
      // cards this day. With 0 received so far, only 3 may be dealt.
      actionCardChances.NEW_YOUTH_PLAYER_1 = 5
      const inserts = setupMocks({
        teams: [{ id: 1 }],
        teamIdsWithYouth: [1],
        youthCardCounts: { 1: 0 }
      })

      await _giveUsersActionCards()

      const youthInserts = inserts.filter(i => YOUTH_ACTIONS.has(i.value.action))
      expect(youthInserts).toHaveLength(3)
    })

    it('only deals the remaining allowance when some youth cards were already received', async () => {
      // 2 cards already received this season → only 1 more may be dealt.
      actionCardChances.NEW_YOUTH_PLAYER_1 = 5
      const inserts = setupMocks({
        teams: [{ id: 1 }],
        teamIdsWithYouth: [1],
        youthCardCounts: { 1: 2 }
      })

      await _giveUsersActionCards()

      const youthInserts = inserts.filter(i => YOUTH_ACTIONS.has(i.value.action))
      expect(youthInserts).toHaveLength(1)
    })

    it('deals no youth cards once the season limit is reached', async () => {
      actionCardChances.NEW_YOUTH_PLAYER_1 = 5
      const inserts = setupMocks({
        teams: [{ id: 1 }],
        teamIdsWithYouth: [1],
        youthCardCounts: { 1: 3 }
      })

      await _giveUsersActionCards()

      const youthInserts = inserts.filter(i => YOUTH_ACTIONS.has(i.value.action))
      expect(youthInserts).toHaveLength(0)
    })

    it('does not deal a guaranteed card when the season limit is already reached', async () => {
      // No youth player would normally trigger a guarantee, but 3 cards were
      // already received this season, so nothing more is dealt.
      const inserts = setupMocks({
        teams: [{ id: 1 }],
        teamIdsWithYouth: [],
        youthCardCounts: { 1: 3 }
      })

      await _giveUsersActionCards()

      const youthInserts = inserts.filter(i => YOUTH_ACTIONS.has(i.value.action))
      expect(youthInserts).toHaveLength(0)
    })

    it('deals only the single guaranteed card on the day it fires (random path skipped), which the DB count then caps on later days', async () => {
      // No youth player and none received yet → guarantee fires. The guarantee
      // short-circuits the random path, so exactly 1 card is dealt this day; it
      // is persisted with season set, so on subsequent days the COUNT(*) lookup
      // reports 1 and the cap allows at most 2 further youth cards.
      actionCardChances.NEW_YOUTH_PLAYER_1 = 5
      const inserts = setupMocks({
        teams: [{ id: 1 }],
        teamIdsWithYouth: [],
        youthCardCounts: { 1: 0 }
      })

      await _giveUsersActionCards()

      const youthInserts = inserts.filter(i => YOUTH_ACTIONS.has(i.value.action))
      expect(youthInserts).toHaveLength(1)
      expect(youthInserts[0].value.season).toBe(SEASON)
    })
  })

  describe('per-type hold limit (MAX_ACTION_CARDS_PER_TYPE = 20)', () => {
    it('does not deal a card of a type the team already holds the max of', async () => {
      // Team owns a youth player → no guarantee, so the FILLER card (chance 1)
      // is the day's card. It is already at the hold limit, so nothing is dealt
      // (rather than creating a card that would hang on `pending`).
      const inserts = setupMocks({
        teams: [{ id: 1 }],
        teamIdsWithYouth: [1],
        heldCounts: [{ team_id: 1, action: 'FILLER', cnt: 20 }]
      })

      await _giveUsersActionCards()

      expect(inserts.filter(i => i.value.action === 'FILLER')).toHaveLength(0)
    })

    it('still deals a card when the team is below the per-type limit', async () => {
      const inserts = setupMocks({
        teams: [{ id: 1 }],
        teamIdsWithYouth: [1],
        heldCounts: [{ team_id: 1, action: 'FILLER', cnt: 19 }]
      })

      await _giveUsersActionCards()

      expect(inserts.filter(i => i.value.action === 'FILLER')).toHaveLength(1)
    })

    it('counts cards dealt earlier in the same run so a single day cannot exceed the limit', async () => {
      // 19 already held + FILLER chance 3 this day would be 22; only 1 may be dealt.
      actionCardChances.FILLER = 3
      const inserts = setupMocks({
        teams: [{ id: 1 }],
        teamIdsWithYouth: [1],
        heldCounts: [{ team_id: 1, action: 'FILLER', cnt: 19 }]
      })

      await _giveUsersActionCards()

      expect(inserts.filter(i => i.value.action === 'FILLER')).toHaveLength(1)
      actionCardChances.FILLER = 1
    })
  })
})
