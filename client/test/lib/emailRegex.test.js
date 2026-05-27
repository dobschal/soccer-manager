import { describe, it, expect } from 'vitest'
import { isValidEmail, EMAIL_REGEX } from '../../lib/emailRegex.js'

describe('emailRegex', () => {
  describe('EMAIL_REGEX', () => {
    it('accepts simple addresses', () => {
      expect(EMAIL_REGEX.test('user@example.com')).toBe(true)
    })

    it('accepts addresses with plus and dot', () => {
      expect(EMAIL_REGEX.test('first.last+tag@sub.example.co.uk')).toBe(true)
    })

    it('rejects addresses without "@"', () => {
      expect(EMAIL_REGEX.test('foo.bar.com')).toBe(false)
    })

    it('rejects addresses without a domain dot', () => {
      expect(EMAIL_REGEX.test('foo@bar')).toBe(false)
    })

    it('rejects whitespace in the address', () => {
      expect(EMAIL_REGEX.test('foo bar@example.com')).toBe(false)
    })
  })

  describe('isValidEmail', () => {
    it('returns false for non-strings', () => {
      expect(isValidEmail(null)).toBe(false)
      expect(isValidEmail(undefined)).toBe(false)
      expect(isValidEmail(123)).toBe(false)
    })

    it('trims whitespace before validating', () => {
      expect(isValidEmail('  user@example.com  ')).toBe(true)
    })

    it('rejects empty input', () => {
      expect(isValidEmail('')).toBe(false)
      expect(isValidEmail('   ')).toBe(false)
    })

    it('rejects overly long input', () => {
      const tooLong = 'a'.repeat(256) + '@example.com'
      expect(isValidEmail(tooLong)).toBe(false)
    })
  })
})
