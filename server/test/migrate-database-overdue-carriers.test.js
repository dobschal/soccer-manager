import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const getGameDayAndSeason = vi.fn()

vi.mock('../lib/database.js', () => ({ query: (...args) => query(...args) }))
vi.mock('../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: (...args) => getGameDayAndSeason(...args)
}))

const { extendOverdueCarriers, retireOverdueCarriers } = await import('../migrate-database.js')

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

// #556 backfill: retirement used to be an implicit state, re-derived as
// `carrier_end_season < currentSeason` at every read site. `_archiveTooOldPlayers`
// only ever looked at players who had a team, so a career that ended while the
// player was unemployed was never cleaned up at all — twelve open IOC buy offers
// for long-retired players survived in production that way.
describe('retireOverdueCarriers', () => {
  beforeEach(() => {
    query.mockReset()
    getGameDayAndSeason.mockReset()
  })

  it('flags every player whose career end is in the past, with or without a team', async () => {
    query.mockResolvedValueOnce([{ games: 1200 }])
    query.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }])
    query.mockResolvedValue({ affectedRows: 4 })
    getGameDayAndSeason.mockResolvedValue({ season: 9, gameDay: 3 })

    await retireOverdueCarriers()

    const [selectSql, selectParams] = query.mock.calls[1]
    expect(selectSql).toBe('SELECT id FROM player WHERE carrier_end_season < ?')
    expect(selectParams).toEqual([9])
    expect(selectSql).not.toContain('team_id')

    const [updateSql, updateParams] = query.mock.calls.find(([sql]) => String(sql).includes('is_retired = 1'))
    expect(updateParams).toEqual([[1, 2, 3]])
    expect(updateSql).toContain('team_id = NULL')
    expect(updateSql).toContain('tour_days_left = 0')
  })

  it('deletes the transfer offers those players were never cleaned out of', async () => {
    query.mockResolvedValueOnce([{ games: 1200 }])
    query.mockResolvedValueOnce([{ id: 7 }])
    query.mockResolvedValue({ affectedRows: 1 })
    getGameDayAndSeason.mockResolvedValue({ season: 9, gameDay: 3 })

    await retireOverdueCarriers()

    expect(query).toHaveBeenCalledWith('DELETE FROM trade_offer WHERE player_id IN (?)', [[7]])
  })

  // A player in his final season is still fully active — `carrier_end_season` is
  // inclusive, so `< season` and not `<= season` is what separates the two.
  it('leaves the current final-season cohort untouched', async () => {
    query.mockResolvedValueOnce([{ games: 1200 }])
    query.mockResolvedValueOnce([])
    getGameDayAndSeason.mockResolvedValue({ season: 9, gameDay: 3 })

    await retireOverdueCarriers()

    expect(query).toHaveBeenCalledTimes(2)
  })

  it('does nothing on a fresh database without games', async () => {
    query.mockResolvedValueOnce([{ games: 0 }])

    await retireOverdueCarriers()

    expect(getGameDayAndSeason).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(1)
  })
})
