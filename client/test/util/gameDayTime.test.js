import { describe, it, expect } from 'vitest'
import { getNextGameDayDate } from '../../util/gameDayTime.js'

describe('getNextGameDayDate', () => {
  it('returns noon UTC of the same day for a morning timestamp', () => {
    const next = getNextGameDayDate(new Date('2026-08-18T09:23:00Z'))
    expect(next.toISOString()).toBe('2026-08-18T12:00:00.000Z')
  })

  it('returns midnight UTC of the next day for an afternoon timestamp', () => {
    const next = getNextGameDayDate(new Date('2026-08-18T12:00:01Z'))
    expect(next.toISOString()).toBe('2026-08-19T00:00:00.000Z')
  })

  it('never returns the boundary it is standing on', () => {
    expect(getNextGameDayDate(new Date('2026-08-18T00:00:00Z')).toISOString()).toBe('2026-08-18T12:00:00.000Z')
    expect(getNextGameDayDate(new Date('2026-08-18T12:00:00Z')).toISOString()).toBe('2026-08-19T00:00:00.000Z')
  })

  it('accepts a MySQL-style timestamp string', () => {
    const next = getNextGameDayDate('2026-08-18T05:00:00Z')
    expect(next.toISOString()).toBe('2026-08-18T12:00:00.000Z')
  })

  it('crosses month boundaries', () => {
    const next = getNextGameDayDate(new Date('2026-08-31T23:59:00Z'))
    expect(next.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })
})
