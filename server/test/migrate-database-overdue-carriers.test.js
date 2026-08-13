import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const getGameDayAndSeason = vi.fn()

vi.mock('../lib/database.js', () => ({ query: (...args) => query(...args) }))
vi.mock('../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: (...args) => getGameDayAndSeason(...args)
}))

const { extendOverdueCarriers } = await import('../migrate-database.js')

describe('extendOverdueCarriers', () => {
  beforeEach(() => {
    query.mockReset()
    getGameDayAndSeason.mockReset()
  })

  it('extends players still on a team whose career already ended', async () => {
    query.mockResolvedValueOnce([{ games: 1200 }])
    query.mockResolvedValue({ affectedRows: 10 })
    getGameDayAndSeason.mockResolvedValue({ season: 9, gameDay: 3 })

    await extendOverdueCarriers()

    expect(query).toHaveBeenCalledWith(
      'UPDATE player SET carrier_end_season=? WHERE team_id IS NOT NULL AND carrier_end_season<?',
      [9, 9]
    )
  })

  // They must retire at the *next* transition, not stay young forever: setting
  // the end season to the current one is exactly what `_archiveTooOldPlayers`
  // picks up with `carrier_end_season <= season`.
  it('sets the career end to the current season, not beyond it', async () => {
    query.mockResolvedValueOnce([{ games: 1200 }])
    query.mockResolvedValue({ affectedRows: 3 })
    getGameDayAndSeason.mockResolvedValue({ season: 9, gameDay: 3 })

    await extendOverdueCarriers()

    const [, params] = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE player'))
    expect(params[0]).toBe(9)
  })

  it('leaves free agents alone — only players on a team are affected', async () => {
    query.mockResolvedValueOnce([{ games: 1200 }])
    query.mockResolvedValue({ affectedRows: 0 })
    getGameDayAndSeason.mockResolvedValue({ season: 9, gameDay: 3 })

    await extendOverdueCarriers()

    const [sql] = query.mock.calls.find(([s]) => s.startsWith('UPDATE player'))
    expect(sql).toContain('team_id IS NOT NULL')
  })

  it('does nothing on a fresh database without games', async () => {
    query.mockResolvedValueOnce([{ games: 0 }])

    await extendOverdueCarriers()

    expect(getGameDayAndSeason).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(1)
  })
})
