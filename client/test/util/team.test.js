import { describe, it, expect } from 'vitest'
import { shortenTeamName } from '../../util/team.js'

describe('shortenTeamName', () => {
  it('returns empty string for falsy input', () => {
    expect(shortenTeamName('')).toBe('')
    expect(shortenTeamName(null)).toBe('')
    expect(shortenTeamName(undefined)).toBe('')
  })

  it('returns a single-word name unchanged', () => {
    expect(shortenTeamName('Berlin')).toBe('Berlin')
  })

  it('returns only the last word of a multi-word name', () => {
    expect(shortenTeamName('FC Berlin')).toBe('Berlin')
    expect(shortenTeamName('1. FC Dynamic Gütersloh')).toBe('Gütersloh')
    expect(shortenTeamName('Real United Sporting Madrid')).toBe('Madrid')
  })

  it('collapses repeated whitespace before picking the last word', () => {
    expect(shortenTeamName('  FC   Berlin   ')).toBe('Berlin')
  })

  it('prefers an explicit short name when provided', () => {
    expect(shortenTeamName('1. FC Dynamic Gütersloh', 'GTL')).toBe('GTL')
    expect(shortenTeamName('FC Berlin', '  BSC  ')).toBe('BSC')
  })

  it('falls back to the last word when short name is empty or whitespace', () => {
    expect(shortenTeamName('FC Berlin', '')).toBe('Berlin')
    expect(shortenTeamName('FC Berlin', '   ')).toBe('Berlin')
    expect(shortenTeamName('FC Berlin', null)).toBe('Berlin')
    expect(shortenTeamName('FC Berlin', undefined)).toBe('Berlin')
  })
})
