import { describe, it, expect, vi } from 'vitest'

let locale = 'de'

vi.mock('../../i18n/index.js', () => ({
  getLocale: () => locale
}))

import { euroFormat, shortEuroFormat } from '../../lib/currency.js'

describe('shortEuroFormat (#523)', () => {
  it('shows at most three digits and at most one decimal', () => {
    // The examples straight from the ticket.
    expect(shortEuroFormat(706_123)).toBe('706K €')
    expect(shortEuroFormat(9_845)).toBe('9.8K €')
    expect(shortEuroFormat(15_987_654)).toBe('15.9M €')
  })

  it('truncates instead of rounding, so the digits are always covered', () => {
    expect(shortEuroFormat(15_999_999)).toBe('15.9M €')
    expect(shortEuroFormat(999_999)).toBe('999K €')
  })

  it('drops a trailing zero decimal', () => {
    expect(shortEuroFormat(2_000_000)).toBe('2M €')
    expect(shortEuroFormat(1_000)).toBe('1K €')
  })

  it('abbreviates millions and billions', () => {
    expect(shortEuroFormat(2_819_192)).toBe('2.8M €')
    expect(shortEuroFormat(1_450_000_000)).toBe('1.4B €')
  })

  it('keeps amounts below 1.000 exact', () => {
    expect(shortEuroFormat(999)).toBe(euroFormat.format(999))
    expect(shortEuroFormat(0)).toBe(euroFormat.format(0))
  })

  it('abbreviates negative balances too', () => {
    expect(shortEuroFormat(-2_500_000)).toBe('-2.5M €')
    expect(shortEuroFormat(-706_123)).toBe('-706K €')
  })

  it('uses the same dot and upper-case unit in every language (#523)', () => {
    const german = [shortEuroFormat(9_845), shortEuroFormat(15_987_654), shortEuroFormat(1_450_000_000)]
    locale = 'en'
    expect([shortEuroFormat(9_845), shortEuroFormat(15_987_654), shortEuroFormat(1_450_000_000)]).toEqual(german)
    expect(german).toEqual(['9.8K €', '15.9M €', '1.4B €'])
    locale = 'de'
  })

  it('treats a missing amount as zero', () => {
    expect(shortEuroFormat(undefined)).toBe(euroFormat.format(0))
    expect(shortEuroFormat(null)).toBe(euroFormat.format(0))
  })
})
