import { describe, it, expect } from 'vitest'
import { maskBadWords, containsBadWords } from '../../lib/badWordsFilter.js'

describe('badWordsFilter', () => {
  describe('maskBadWords', () => {
    it('replaces bad words with asterisks of matching length', () => {
      expect(maskBadWords('what the fuck')).toBe('what the ****')
    })

    it('is case-insensitive', () => {
      expect(maskBadWords('What the FUCK')).toBe('What the ****')
      expect(maskBadWords('SHIT happens')).toBe('**** happens')
    })

    it('leaves clean text unchanged', () => {
      expect(maskBadWords('Great game today!')).toBe('Great game today!')
    })

    it('handles multiple bad words', () => {
      expect(maskBadWords('fuck this shit')).toBe('**** this ****')
    })

    it('does not match partial words (no false positives)', () => {
      expect(maskBadWords('grass is green')).toBe('grass is green')
      expect(maskBadWords('class assignment')).toBe('class assignment')
      expect(maskBadWords('classic move')).toBe('classic move')
    })

    it('filters German profanity', () => {
      expect(maskBadWords('du Arschloch')).toBe('du *********')
      expect(maskBadWords('was für ein Wichser')).toBe('was für ein *******')
    })

    it('filters hate speech and extremist terms', () => {
      expect(maskBadWords('Nazi raus')).toBe('**** raus')
      expect(maskBadWords('Hitler war böse')).toBe('****** war böse')
      expect(maskBadWords('du bist ein Nazi')).toBe('du bist ein ****')
    })
  })

  describe('containsBadWords', () => {
    it('returns true for text with bad words', () => {
      expect(containsBadWords('what the fuck')).toBe(true)
    })

    it('returns false for clean text', () => {
      expect(containsBadWords('Great game today!')).toBe(false)
    })

    it('is case-insensitive', () => {
      expect(containsBadWords('SHIT')).toBe(true)
    })

    it('does not match partial words', () => {
      expect(containsBadWords('grass')).toBe(false)
    })
  })
})
