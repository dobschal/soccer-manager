import { describe, it, expect, vi } from 'vitest'

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn(key => key),
  getLocale: vi.fn(() => 'en')
}))

import { countryName, countryFlagUrl, languageName } from '../../util/userLocale.js'

describe('userLocale', () => {
  describe('countryName', () => {
    it('translates an ISO country code into a name', () => {
      expect(countryName('DE')).toBe('Germany')
    })

    it('accepts lowercase codes', () => {
      expect(countryName('at')).toBe('Austria')
    })

    it('returns null without a code', () => {
      expect(countryName(null)).toBeNull()
      expect(countryName('')).toBeNull()
    })
  })

  describe('countryFlagUrl', () => {
    it('builds a lowercase flag url', () => {
      expect(countryFlagUrl('DE')).toBe('https://flagcdn.com/w40/de.png')
    })

    it('honours a custom width', () => {
      expect(countryFlagUrl('DE', 80)).toBe('https://flagcdn.com/w80/de.png')
    })

    it('returns null without a code', () => {
      expect(countryFlagUrl(undefined)).toBeNull()
    })
  })

  describe('languageName', () => {
    it('labels the supported languages', () => {
      expect(languageName('en')).toBe('common.english')
      expect(languageName('de')).toBe('common.german')
    })

    it('falls back to the raw code for unknown languages', () => {
      expect(languageName('fr')).toBe('FR')
    })

    it('returns null without a language', () => {
      expect(languageName(null)).toBeNull()
    })
  })
})
