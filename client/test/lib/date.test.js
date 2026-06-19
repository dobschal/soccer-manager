import { describe, it, expect } from 'vitest'
import { isToday } from '../../lib/date.js'

describe('isToday', () => {
  it('returns true for a timestamp on the current calendar day', () => {
    const now = new Date()
    expect(isToday(now)).toBe(true)
    expect(isToday(now.toISOString())).toBe(true)
  })

  it('returns false for yesterday', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(isToday(yesterday)).toBe(false)
  })

  it('returns false for null, undefined and invalid dates', () => {
    expect(isToday(null)).toBe(false)
    expect(isToday(undefined)).toBe(false)
    expect(isToday('not-a-date')).toBe(false)
  })
})
