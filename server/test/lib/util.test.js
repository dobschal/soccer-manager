import { describe, expect, it } from 'vitest'
import { charLength, truncateChars } from '../../lib/util.js'

describe('truncateChars', () => {
  it('leaves a short string untouched', () => {
    expect(truncateChars('Away', 40)).toBe('Away')
  })

  it('cuts plain text down to the character limit', () => {
    expect(truncateChars('abcdef', 3)).toBe('abc')
  })

  it('counts an emoji as a single character', () => {
    expect(truncateChars('😳😳😳', 3)).toBe('😳😳😳')
  })

  it('never leaves half an emoji behind', () => {
    // '😳' is a surrogate pair, so a naive slice(0, 3) would cut it in half
    // and produce a lone surrogate — invalid UTF-8 that MySQL rejects.
    const result = truncateChars('ab😳cd', 3)
    expect(result).toBe('ab😳')
    expect(isWellFormed(result)).toBe(true)
  })

  it('keeps every truncation position well-formed', () => {
    const input = '🏆Team😳Name⚽'
    for (let max = 0; max <= charLength(input) + 2; max++) {
      expect(isWellFormed(truncateChars(input, max))).toBe(true)
    }
  })

  it('returns an empty string for non-strings', () => {
    expect(truncateChars(null, 10)).toBe('')
    expect(truncateChars(undefined, 10)).toBe('')
    expect(truncateChars(42, 10)).toBe('')
  })
})

describe('charLength', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(charLength('😳')).toBe(1)
    expect('😳'.length).toBe(2)
    expect(charLength('FC 😳 United')).toBe(11)
  })
})

/**
 * @param {string} value
 * @returns {boolean} whether the string survives a UTF-8 round trip unchanged
 */
function isWellFormed (value) {
  return Buffer.from(value, 'utf8').toString('utf8') === value
}
