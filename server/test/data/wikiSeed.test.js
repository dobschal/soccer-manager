import { describe, it, expect } from 'vitest'
import { WIKI_SEED } from '../../data/wikiSeed.js'

const LOCALES = ['en', 'de']
const MAX_TITLE = 255
const MAX_SUBTITLE = 255

describe('wiki seed content (#441)', () => {
  it('covers all requested topics in both locales', () => {
    expect(WIKI_SEED).toHaveLength(29)
  })

  it('documents the fair-play rules so sanctions are not a surprise', () => {
    const topic = WIKI_SEED.find(t => t.key === 'fair-play')
    expect(topic).toBeTruthy()
    // Second accounts and arranged transfers are the two patterns the fraud
    // detectors flag — both must be spelled out for players in both locales.
    expect(topic.en.text).toMatch(/second account/i)
    expect(topic.en.text).toMatch(/75%/)
    expect(topic.de.text).toMatch(/Zweit-Account/i)
    expect(topic.de.text).toMatch(/75%/)
  })

  it('documents the daily login cycle and its four milestones (#501)', () => {
    const topic = WIKI_SEED.find(t => t.key === 'daily-login')
    expect(topic).toBeTruthy()
    for (const locale of LOCALES) {
      for (const day of ['3', '7', '15', '30']) {
        expect(topic[locale].text).toContain(day)
      }
    }
  })

  it('explains the automatic bot bids on aged card offers (#505)', () => {
    const topic = WIKI_SEED.find(t => t.key === 'action-card-market')
    expect(topic.en.text).toMatch(/24 hours/i)
    expect(topic.de.text).toMatch(/24 Stunden/i)
  })

  it('explains saved lineups on the lineup page (#481)', () => {
    const topic = WIKI_SEED.find(t => t.key === 'lineup')
    expect(topic.en.text).toMatch(/Saved lineups/i)
    expect(topic.de.text).toMatch(/Gespeicherte Aufstellungen/i)
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

describe('wiki seed content for the #538/#539/#540/#543 changes', () => {
  it('describes the graded out-of-position penalty, not a flat 50% (#540)', () => {
    const topic = WIKI_SEED.find(t => t.key === 'in-game-level')
    for (const locale of LOCALES) {
      const text = topic[locale].text
      for (const step of ['10%', '20%', '30%', '50%']) {
        expect(text).toContain(step)
      }
    }
  })

  it('quotes the recalibrated salary curve (#543)', () => {
    const topic = WIKI_SEED.find(t => t.key === 'players')
    expect(topic.en.text).toContain('18,500')
    expect(topic.de.text).toContain('18.500')
    // Neither the original ceiling nor the over-steep one it briefly had.
    for (const stale of ['10,308', '50,000']) expect(topic.en.text).not.toContain(stale)
    for (const stale of ['10.308', '50.000']) expect(topic.de.text).not.toContain(stale)
  })

  it('explains that price fields only exist for built stands (#538)', () => {
    const topic = WIKI_SEED.find(t => t.key === 'stadium')
    expect(topic.en.text).toMatch(/not built yet/i)
    expect(topic.de.text).toMatch(/nicht gebaute Tribüne/i)
  })

  it('documents the match ticker (#539)', () => {
    const topic = WIKI_SEED.find(t => t.key === 'match-day')
    expect(topic.en.text).toMatch(/match ticker/i)
    expect(topic.en.text).toMatch(/half time/i)
    expect(topic.de.text).toMatch(/Spielticker/i)
    expect(topic.de.text).toMatch(/Halbzeit/i)
  })
})

describe('wiki seed content for the #541 chat changes', () => {
  it('documents voice messages and where they work', () => {
    const topic = WIKI_SEED.find(t => t.key === 'chat')
    expect(topic.en.text).toMatch(/voice message/i)
    expect(topic.en.text).toMatch(/two minutes/i)
    // The Android limitation is a real constraint players will hit.
    expect(topic.en.text).toMatch(/Android app cannot record/i)
    expect(topic.de.text).toMatch(/Sprachnachricht/i)
    expect(topic.de.text).toMatch(/zwei Minuten/i)
    expect(topic.de.text).toMatch(/Android-App kann noch nicht aufnehmen/i)
  })
})
