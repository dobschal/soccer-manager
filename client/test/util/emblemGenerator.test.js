import { describe, it, expect } from 'vitest'
import { splitTeamName, generateEmblem } from '../../util/emblemGenerator.js'

describe('splitTeamName', () => {
  it('returns empty parts for empty input', () => {
    expect(splitTeamName('')).toEqual({ prefix1: '', prefix2: '', city: '' })
    expect(splitTeamName(null)).toEqual({ prefix1: '', prefix2: '', city: '' })
    expect(splitTeamName(undefined)).toEqual({ prefix1: '', prefix2: '', city: '' })
  })

  it('treats a single token as the city', () => {
    expect(splitTeamName('Berlin')).toEqual({ prefix1: '', prefix2: '', city: 'Berlin' })
  })

  it('treats two tokens as prefix2 + city', () => {
    expect(splitTeamName('FC Berlin')).toEqual({ prefix1: '', prefix2: 'FC', city: 'Berlin' })
  })

  it('splits three single-token parts as prefix1 + prefix2 + city', () => {
    expect(splitTeamName('FC Real Berlin')).toEqual({ prefix1: 'FC', prefix2: 'Real', city: 'Berlin' })
  })

  it('keeps the compound leading prefix "1. FC" together when followed directly by the city', () => {
    expect(splitTeamName('1. FC Berlin')).toEqual({ prefix1: '1. FC', prefix2: '', city: 'Berlin' })
  })

  it('keeps the compound leading prefix "2. FC" together when followed directly by the city', () => {
    expect(splitTeamName('2. FC Valleverde')).toEqual({ prefix1: '2. FC', prefix2: '', city: 'Valleverde' })
  })

  it('keeps the compound leading prefix together for 4-token names', () => {
    expect(splitTeamName('1. FC Power Doradal')).toEqual({
      prefix1: '1. FC',
      prefix2: 'Power',
      city: 'Doradal'
    })
    expect(splitTeamName('2. FC United Pescara')).toEqual({
      prefix1: '2. FC',
      prefix2: 'United',
      city: 'Pescara'
    })
  })

  it('falls back to the generic split for 4-token names without a known compound prefix', () => {
    expect(splitTeamName('FC Carl Zeiss Jena')).toEqual({
      prefix1: 'FC Carl',
      prefix2: 'Zeiss',
      city: 'Jena'
    })
  })

  it('collapses repeated whitespace before splitting', () => {
    expect(splitTeamName('1. FC  Kaiserslautern')).toEqual({
      prefix1: '1. FC',
      prefix2: '',
      city: 'Kaiserslautern'
    })
  })
})

describe('generateEmblem with compound-prefix team names', () => {
  it('renders the full compound prefix on the emblem instead of just the leading token', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      color2: '#0a3b88',
      teamName: '1. FC Berlin',
      prefixOnEmblem: true,
      size: 200
    })
    expect(svg).toContain('>1. FC<')
    expect(svg).not.toMatch(/>1\.<\/text>/)
  })

  it('puts the full compound prefix on the banner when prefix1OnBanner is enabled', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      color2: '#0a3b88',
      teamName: '1. FC Berlin',
      prefix1OnBanner: true,
      size: 200
    })
    expect(svg).toContain('>1. FC BERLIN<')
  })
})
