import { describe, it, expect, vi, beforeEach } from 'vitest'

let locale = 'de'

vi.mock('../../i18n/index.js', () => ({
  getLocale: () => locale
}))

import { euroFormat, shortEuroFormat } from '../../lib/currency.js'

beforeEach(() => {
  locale = 'de'
})

describe('shortEuroFormat (#523)', () => {
  it('shows at most three digits and at most one decimal', () => {
    // The examples straight from the ticket.
    expect(shortEuroFormat(706_123)).toBe('706k €')
    expect(shortEuroFormat(9_845)).toBe('9,8k €')
    expect(shortEuroFormat(15_987_654)).toBe('15,9m €')
  })

  it('truncates instead of rounding, so the digits are always covered', () => {
    expect(shortEuroFormat(15_999_999)).toBe('15,9m €')
    expect(shortEuroFormat(999_999)).toBe('999k €')
  })

  it('drops a trailing zero decimal', () => {
    expect(shortEuroFormat(2_000_000)).toBe('2m €')
    expect(shortEuroFormat(1_000)).toBe('1k €')
  })

  it('abbreviates millions and billions', () => {
    expect(shortEuroFormat(2_819_192)).toBe('2,8m €')
    expect(shortEuroFormat(1_450_000_000)).toBe('1,4b €')
  })

  it('keeps amounts below 1.000 exact', () => {
    expect(shortEuroFormat(999)).toBe(euroFormat.format(999))
    expect(shortEuroFormat(0)).toBe(euroFormat.format(0))
  })

  it('abbreviates negative balances too', () => {
    expect(shortEuroFormat(-2_500_000)).toBe('-2,5m €')
    expect(shortEuroFormat(-706_123)).toBe('-706k €')
  })

  it('uses a dot as decimal separator in English', () => {
    locale = 'en'
    expect(shortEuroFormat(9_845)).toBe('9.8k €')
    expect(shortEuroFormat(15_987_654)).toBe('15.9m €')
    expect(shortEuroFormat(706_123)).toBe('706k €')
  })

  it('treats a missing amount as zero', () => {
    expect(shortEuroFormat(undefined)).toBe(euroFormat.format(0))
    expect(shortEuroFormat(null)).toBe(euroFormat.format(0))
  })
})
