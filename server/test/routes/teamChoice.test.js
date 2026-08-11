import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/playerHelper.js', () => ({
  getAveragePlanPriceOfPlayer: vi.fn(async (player) => player.level * 1000)
}))

vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

vi.mock('../../helper/sponsorHelper.js', () => ({
  getSponsor: vi.fn()
}))

vi.mock('../../helper/stadiumHelper.js', () => ({
  completeAllStadiumConstructionsForTeam: vi.fn()
}))

vi.mock('../../prepare-season.js', () => ({
  prepareSeason: vi.fn(),
  regenerateTeamData: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 1, season: 5 })
}))

vi.mock('../../lib/userCache.js', () => ({
  clearUserCache: vi.fn()
}))

vi.mock('../../lib/pushNotification.js', () => ({
  sendPushNotifications: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getAveragePlanPriceOfPlayer } from '../../helper/playerHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import { getSponsor } from '../../helper/sponsorHelper.js'
import { sendPushNotifications } from '../../lib/pushNotification.js'
import { STARTER_ACTION_CARDS } from '../../routes/teamChoice.js'
import { completeAllStadiumConstructionsForTeam } from '../../helper/stadiumHelper.js'
import { prepareSeason, regenerateTeamData } from '../../prepare-season.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { clearUserCache } from '../../lib/userCache.js'
import handlers from '../../routes/teamChoice.js'

describe('teamChoice routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 5 })
    getAveragePlanPriceOfPlayer.mockImplementation(async (player) => player.level * 1000)
  })

  describe('hasTeam', () => {
    it('returns true when a team is assigned to the user', async () => {
      query.mockResolvedValueOnce([{ id: 42 }])
      const result = await handlers.hasTeam({ user: { id: 1 } })
      expect(result).toEqual({ hasTeam: true })
      expect(query).toHaveBeenCalledWith('SELECT id FROM team WHERE user_id=? LIMIT 1', [1])
    })

    it('returns false when the user has no team yet', async () => {
      query.mockResolvedValueOnce([])
      const result = await handlers.hasTeam({ user: { id: 1 } })
      expect(result).toEqual({ hasTeam: false })
    })

    it('returns false for an unauthenticated request', async () => {
      const result = await handlers.hasTeam({})
      expect(result).toEqual({ hasTeam: false })
      expect(query).not.toHaveBeenCalled()
    })
  })

  describe('getAvailableTeams', () => {
    it('throws when the user is not authenticated', async () => {
      await expect(handlers.getAvailableTeams({ locale: 'en' }))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('returns teams with computed value, sorted by league level', async () => {
      const team = testData.team({ id: 10, level: 2, league: 0, emblem: '{}', color: '#abc', user_id: null })
      const player1 = testData.player({ id: 100, team_id: 10, level: 50 })
      const player2 = testData.player({ id: 101, team_id: 10, level: 70 })
      query
        .mockResolvedValueOnce([team])
        .mockResolvedValueOnce([player1, player2])

      const result = await handlers.getAvailableTeams({ user: { id: 1 }, locale: 'en' })

      expect(prepareSeason).not.toHaveBeenCalled()
      expect(result.teams).toHaveLength(1)
      expect(result.teams[0]).toMatchObject({
        id: 10,
        name: team.name,
        level: 2,
        league: 0,
        emblem: '{}',
        color: '#abc',
        value: 120000 // 50_000 + 70_000 from mocked getAveragePlanPriceOfPlayer
      })
      expect(getAveragePlanPriceOfPlayer).toHaveBeenCalledTimes(2)
    })

    it('calls prepareSeason when no teams are free yet', async () => {
      const newTeam = testData.team({ id: 99, level: 3, league: 1, user_id: null })
      query
        .mockResolvedValueOnce([]) // initial query empty
        .mockResolvedValueOnce([newTeam]) // after prepareSeason
        .mockResolvedValueOnce([]) // no players

      const result = await handlers.getAvailableTeams({ user: { id: 1 }, locale: 'en' })

      expect(prepareSeason).toHaveBeenCalledTimes(1)
      expect(result.teams).toHaveLength(1)
      expect(result.teams[0].value).toBe(0)
    })

    it('returns an empty list with value 0 when there are no players', async () => {
      const team = testData.team({ id: 11, level: 2, league: 0, user_id: null })
      query
        .mockResolvedValueOnce([team])
      // No second query for players because teamIds is non-empty, so it queries — handle:
      query.mockResolvedValueOnce([])

      const result = await handlers.getAvailableTeams({ user: { id: 1 }, locale: 'en' })

      expect(result.teams[0].value).toBe(0)
    })
  })

  describe('getAvailableLeagues', () => {
    it('throws when the user is not authenticated', async () => {
      await expect(handlers.getAvailableLeagues({ locale: 'en' }))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('groups free teams into leagues with counts, sorted by level/league', async () => {
      query.mockResolvedValueOnce([
        testData.team({ id: 1, level: 2, league: 1, user_id: null }),
        testData.team({ id: 2, level: 2, league: 1, user_id: null }),
        testData.team({ id: 3, level: 2, league: 0, user_id: null }),
        testData.team({ id: 4, level: 3, league: 0, user_id: null })
      ])

      const result = await handlers.getAvailableLeagues({ user: { id: 1 }, locale: 'en' })

      expect(result.leagues).toEqual([
        { level: 2, league: 0, freeTeams: 1 },
        { level: 2, league: 1, freeTeams: 2 },
        { level: 3, league: 0, freeTeams: 1 }
      ])
      expect(prepareSeason).not.toHaveBeenCalled()
    })

    it('calls prepareSeason when no free teams exist yet', async () => {
      query
        .mockResolvedValueOnce([]) // empty
        .mockResolvedValueOnce([testData.team({ id: 9, level: 2, league: 0, user_id: null })])

      const result = await handlers.getAvailableLeagues({ user: { id: 1 }, locale: 'en' })

      expect(prepareSeason).toHaveBeenCalledTimes(1)
      expect(result.leagues).toHaveLength(1)
    })
  })

  describe('chooseRandomTeamInLeague', () => {
    it('throws when the user is not authenticated', async () => {
      await expect(handlers.chooseRandomTeamInLeague(2, 0, { locale: 'en' }))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('rejects non-number level/league', async () => {
      await expect(handlers.chooseRandomTeamInLeague('x', 0, { user: { id: 1 }, locale: 'en' }))
        .rejects.toMatchObject({ message: 'Invalid parameter' })
    })

    it('rejects when the user already has a team', async () => {
      query.mockResolvedValueOnce([{ id: 7 }])
      await expect(handlers.chooseRandomTeamInLeague(2, 0, { user: { id: 1 }, locale: 'en' }))
        .rejects.toMatchObject({ message: 'You already manage a team.' })
    })

    it('rejects when no free team exists in the league', async () => {
      query
        .mockResolvedValueOnce([]) // user has no team
        .mockResolvedValueOnce([]) // no random team
      await expect(handlers.chooseRandomTeamInLeague(2, 0, { user: { id: 1 }, locale: 'en' }))
        .rejects.toMatchObject({ message: 'This team is not available anymore.' })
    })

    it('assigns a random team and returns it', async () => {
      const team = testData.team({ id: 5, level: 2, league: 0, user_id: null, name: 'Bot FC', emblem: '{}', color: '#abc', short_name: 'BFC' })
      query
        .mockResolvedValueOnce([]) // no team for user yet
        .mockResolvedValueOnce([team]) // random team
        .mockResolvedValueOnce({}) // delete log_message
        .mockResolvedValueOnce({}) // delete finance_log
        .mockResolvedValueOnce({}) // delete trade_offer from
        .mockResolvedValueOnce({}) // delete trade_offer player
        .mockResolvedValueOnce({}) // update team
        .mockResolvedValueOnce({}) // delete action_card
        .mockResolvedValueOnce({}) // insert action_card 1
        .mockResolvedValueOnce({}) // insert action_card 2
      getSponsor.mockResolvedValue({ sponsor: null })

      const result = await handlers.chooseRandomTeamInLeague(2, 0, { user: { id: 1, username: 'sascha' }, locale: 'en' })

      expect(result.team).toMatchObject({ id: 5, name: 'Bot FC', short_name: 'BFC', emblem: '{}', color: '#abc' })
      expect(query).toHaveBeenCalledWith(
        'UPDATE team SET user_id=?, balance=500000, coach_since=CURRENT_TIMESTAMP WHERE id=?',
        [1, 5]
      )
      expect(regenerateTeamData).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }))
      expect(clearUserCache).toHaveBeenCalledWith(1)
    })
  })

  describe('chooseTeam', () => {
    it('throws when the user is not authenticated', async () => {
      await expect(handlers.chooseTeam(1, { locale: 'en' }))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('rejects non-number teamId', async () => {
      await expect(handlers.chooseTeam('foo', { user: { id: 1 }, locale: 'en' }))
        .rejects.toMatchObject({ message: 'Invalid parameter' })
    })

    it('rejects when the user already has a team', async () => {
      query.mockResolvedValueOnce([{ id: 7 }]) // user already has team

      await expect(handlers.chooseTeam(5, { user: { id: 1 }, locale: 'en' }))
        .rejects.toMatchObject({ message: 'You already manage a team.' })
    })

    it('rejects when the team is not available', async () => {
      query
        .mockResolvedValueOnce([]) // user has no team
        .mockResolvedValueOnce([]) // team not found / taken

      await expect(handlers.chooseTeam(5, { user: { id: 1 }, locale: 'en' }))
        .rejects.toMatchObject({ message: 'This team is not available anymore.' })
    })

    it('claims the team and runs the cleanup', async () => {
      const team = testData.team({ id: 5, level: 2, league: 0, user_id: null, name: 'Bot FC' })
      query
        .mockResolvedValueOnce([]) // no team for user yet
        .mockResolvedValueOnce([team]) // team available
        .mockResolvedValueOnce({}) // delete log_message
        .mockResolvedValueOnce({}) // delete finance_log
        .mockResolvedValueOnce({}) // delete trade_offer from
        .mockResolvedValueOnce({}) // delete trade_offer player
        .mockResolvedValueOnce({}) // update team user_id/balance
        .mockResolvedValueOnce({}) // delete sponsor (if any)
        .mockResolvedValueOnce({}) // delete action_card
        .mockResolvedValueOnce({}) // insert action_card 1
        .mockResolvedValueOnce({}) // insert action_card 2

      getSponsor.mockResolvedValue({ sponsor: { id: 17 } })

      const result = await handlers.chooseTeam(5, { user: { id: 1, username: 'sascha' }, locale: 'en' })

      expect(result).toEqual({ success: true })
      expect(addLogMessage).toHaveBeenCalledWith(
        expect.stringContaining('Bot FC'),
        expect.objectContaining({ id: 5 }),
        null,
        null,
        'hand-peace-o',
        undefined,
        'info'
      )
      expect(query).toHaveBeenCalledWith(
        'UPDATE team SET user_id=?, balance=500000, coach_since=CURRENT_TIMESTAMP WHERE id=?',
        [1, 5]
      )
      expect(query).toHaveBeenCalledWith('DELETE FROM finance_log WHERE team_id=?', [5])
      expect(query).toHaveBeenCalledWith('DELETE FROM sponsor WHERE id=?', [17])
      expect(regenerateTeamData).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }))
      expect(completeAllStadiumConstructionsForTeam).toHaveBeenCalledWith(5, 1, 5)
      expect(clearUserCache).toHaveBeenCalledWith(1)
    })

    it('skips sponsor cleanup when the team has no sponsor', async () => {
      const team = testData.team({ id: 6, level: 2, league: 0, user_id: null, name: 'Bot FC 2' })
      query
        .mockResolvedValueOnce([]) // no team for user yet
        .mockResolvedValueOnce([team]) // team available
        .mockResolvedValueOnce({}) // delete log_message
        .mockResolvedValueOnce({}) // delete finance_log
        .mockResolvedValueOnce({}) // delete trade_offer from
        .mockResolvedValueOnce({}) // delete trade_offer player
        .mockResolvedValueOnce({}) // update team
        .mockResolvedValueOnce({}) // delete action_card
        .mockResolvedValueOnce({}) // insert action_card 1
        .mockResolvedValueOnce({}) // insert action_card 2

      getSponsor.mockResolvedValue({ sponsor: null })

      await handlers.chooseTeam(6, { user: { id: 1, username: 'sascha' }, locale: 'en' })

      const sponsorDeletes = query.mock.calls.filter(([sql]) => /DELETE FROM sponsor/.test(sql))
      expect(sponsorDeletes).toHaveLength(0)
    })
  })
})

describe('team takeover starter cards and admin push (#518, #449)', () => {
  const team = testData.team({ id: 5, level: 2, league: 0, user_id: null, name: 'Bot FC' })

  beforeEach(() => {
    vi.clearAllMocks()
    getSponsor.mockResolvedValue({ sponsor: null })
    query.mockImplementation(async (sql) => {
      const text = String(sql)
      if (text.includes('SELECT id FROM team WHERE user_id=?')) return []
      if (text.includes('FROM team\n       WHERE id=?') || text.includes('WHERE id=? AND user_id IS NULL')) return [team]
      if (text.includes('FROM user WHERE is_admin')) return [{ id: 9 }, { id: 12 }]
      return []
    })
  })

  /**
   * @returns {string[]} the action types inserted during the takeover
   */
  function insertedCardActions () {
    return query.mock.calls
      .filter(([sql]) => String(sql).includes('INSERT INTO action_card'))
      .map(([, card]) => card.action)
  }

  it('hands the new manager a star player and a youth star (#518)', async () => {
    await handlers.chooseTeam(5, { user: { id: 1, username: 'sascha' }, locale: 'en' })

    const actions = insertedCardActions()
    expect(actions).toContain('STAR_PLAYER')
    expect(actions).toContain('NEW_YOUTH_PLAYER_3')
  })

  it('hands the new manager a million bonus card (#518)', async () => {
    await handlers.chooseTeam(5, { user: { id: 1, username: 'sascha' }, locale: 'en' })

    expect(insertedCardActions()).toContain('MILLION_BONUS')
  })

  it('still hands out the original two starter cards', async () => {
    await handlers.chooseTeam(5, { user: { id: 1, username: 'sascha' }, locale: 'en' })

    const actions = insertedCardActions()
    expect(actions).toContain('NEW_YOUTH_PLAYER_1')
    expect(actions).toContain('LEVEL_UP_PLAYER_40')
    expect(actions).toHaveLength(STARTER_ACTION_CARDS.length)
  })

  it('pushes the manager and team name to every admin (#449)', async () => {
    await handlers.chooseTeam(5, { user: { id: 1, username: 'sascha' }, locale: 'en' })
    // The push is fire-and-forget — let its microtasks drain.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(sendPushNotifications).toHaveBeenCalledTimes(1)
    const [userIds, , body] = sendPushNotifications.mock.calls[0]
    expect(userIds).toEqual([9, 12])
    expect(body).toContain('sascha')
    expect(body).toContain('Bot FC')
  })

  it('completes the takeover even when the admin push fails', async () => {
    sendPushNotifications.mockRejectedValueOnce(new Error('APNs down'))

    const result = await handlers.chooseTeam(5, { user: { id: 1, username: 'sascha' }, locale: 'en' })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(result).toEqual({ success: true })
  })

  it('sends no push when there is no admin with a device', async () => {
    query.mockImplementation(async (sql) => {
      const text = String(sql)
      if (text.includes('SELECT id FROM team WHERE user_id=?')) return []
      if (text.includes('WHERE id=? AND user_id IS NULL')) return [team]
      return []
    })

    await handlers.chooseTeam(5, { user: { id: 1, username: 'sascha' }, locale: 'en' })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(sendPushNotifications).not.toHaveBeenCalled()
  })
})
