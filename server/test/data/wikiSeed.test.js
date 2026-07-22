import { describe, it, expect } from 'vitest'
import { WIKI_SEED } from '../../data/wikiSeed.js'

const LOCALES = ['en', 'de']
const MAX_TITLE = 255
const MAX_SUBTITLE = 255

describe('wiki seed content (#441)', () => {
  it('covers all 25 requested topics in both locales', () => {
    expect(WIKI_SEED).toHaveLength(25)
  })

  it('every topic has a unique, kebab-case page key (#456)', () => {
    const keys = WIKI_SEED.map(t => t.key)
    for (const key of keys) {
      expect(typeof key, 'missing key').toBe('string')
      expect(key).toMatch(/^[a-z][a-z0-9-]*$/)
    }
    expect(new Set(keys).size).toBe(keys.length)
  })

  for (const locale of LOCALES) {
    describe(`locale: ${locale}`, () => {
      it('every topic has a non-empty title and text', () => {
        for (const topic of WIKI_SEED) {
          const entry = topic[locale]
          expect(entry, `missing ${locale} entry`).toBeTruthy()
          expect(entry.title.trim().length).toBeGreaterThan(0)
          expect(entry.text.trim().length).toBeGreaterThan(0)
        }
      })

      it('respects the column length limits', () => {
        for (const topic of WIKI_SEED) {
          const entry = topic[locale]
          expect(entry.title.length).toBeLessThanOrEqual(MAX_TITLE)
          if (entry.subtitle) expect(entry.subtitle.length).toBeLessThanOrEqual(MAX_SUBTITLE)
        }
      })

      it('has unique titles', () => {
        const titles = WIKI_SEED.map(t => t[locale].title)
        expect(new Set(titles).size).toBe(titles.length)
      })

      it('uses plain text, not Markdown headings (the wiki renders text verbatim)', () => {
        for (const topic of WIKI_SEED) {
          const lines = topic[locale].text.split('\n')
          for (const line of lines) {
            expect(line.startsWith('#'), `Markdown heading in "${topic[locale].title}"`).toBe(false)
          }
          // Template-literal interpolation markers would leak into the page.
          expect(topic[locale].text).not.toContain('${')
        }
      })
    })
  }
})
