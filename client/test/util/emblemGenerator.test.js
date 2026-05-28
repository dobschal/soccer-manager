import { describe, it, expect } from 'vitest'
import {
  generateEmblem,
  resolveWordsOnBanner,
  splitTeamNameWords
} from '../../util/emblemGenerator.js'

describe('splitTeamNameWords', () => {
  it('returns an empty array for falsy input', () => {
    expect(splitTeamNameWords('')).toEqual([])
    expect(splitTeamNameWords(null)).toEqual([])
    expect(splitTeamNameWords(undefined)).toEqual([])
  })

  it('returns each whitespace-separated word as its own entry', () => {
    expect(splitTeamNameWords('Berlin')).toEqual(['Berlin'])
    expect(splitTeamNameWords('FC Berlin')).toEqual(['FC', 'Berlin'])
    expect(splitTeamNameWords('1. FC Berlin')).toEqual(['1.', 'FC', 'Berlin'])
  })

  it('collapses repeated whitespace', () => {
    expect(splitTeamNameWords('  1.   FC   Berlin  ')).toEqual(['1.', 'FC', 'Berlin'])
  })
})

describe('resolveWordsOnBanner', () => {
  it('defaults to all words visible when nothing is stored', () => {
    expect(resolveWordsOnBanner(['FC', 'Berlin'], {})).toEqual([true, true])
  })

  it('uses the explicit wordsOnBanner array when present', () => {
    const result = resolveWordsOnBanner(['FC', 'Real', 'Berlin'], { wordsOnBanner: [false, true, true] })
    expect(result).toEqual([false, true, true])
  })

  it('extends the wordsOnBanner array with true if it is shorter than the word list', () => {
    const result = resolveWordsOnBanner(['FC', 'Real', 'Berlin'], { wordsOnBanner: [false, true] })
    expect(result).toEqual([false, true, true])
  })

  it('falls back to the legacy prefix flags (last word always on)', () => {
    expect(resolveWordsOnBanner(['FC', 'Berlin'], { prefix1OnBanner: true })).toEqual([true, true])
    expect(resolveWordsOnBanner(['FC', 'Berlin'], { prefix1OnBanner: false })).toEqual([false, true])
    expect(resolveWordsOnBanner(['1.', 'FC', 'Berlin'], { prefix1OnBanner: true, prefix2OnBanner: true })).toEqual([true, true, true])
    expect(resolveWordsOnBanner(['1.', 'FC', 'Berlin'], { prefix1OnBanner: false, prefix2OnBanner: true })).toEqual([false, true, true])
  })
})

describe('generateEmblem banner rendering', () => {
  it('renders every word on the banner by default', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      teamName: '1. FC Berlin',
      size: 200
    })
    expect(svg).toContain('>1. FC BERLIN<')
  })

  it('honours the wordsOnBanner array', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      teamName: '1. FC Berlin',
      wordsOnBanner: [false, true, true],
      size: 200
    })
    expect(svg).toContain('>FC BERLIN<')
    expect(svg).not.toContain('1.')
  })

  it('falls back to legacy prefix flags when wordsOnBanner is missing', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      teamName: '1. FC Berlin',
      prefix1OnBanner: true,
      prefix2OnBanner: false,
      size: 200
    })
    expect(svg).toContain('>1. BERLIN<')
  })

  it('does not render the large prefix-on-emblem text any more', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      teamName: '1. FC Berlin',
      size: 200
    })
    expect(svg).not.toContain('Prefix inside emblem')
  })
})
