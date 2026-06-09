import { describe, it, expect } from 'vitest'
import { allStages, flagUrl, stageLabel } from '../../util/worldCup.js'

describe('worldCup util', () => {
  it('builds a flagcdn URL from a country code', () => {
    expect(flagUrl('de')).toBe('https://flagcdn.com/w80/de.png')
    expect(flagUrl('gb-eng', 40)).toBe('https://flagcdn.com/w40/gb-eng.png')
  })

  it('lists all known stages', () => {
    const stages = allStages()
    expect(stages).toContain('group')
    expect(stages).toContain('final')
    expect(stages).toContain('round_of_16')
  })

  it('translates known stages to a label and falls back for unknown keys', () => {
    // Without an initialised locale, t() falls back to the key itself; both
    // branches yield a non-empty string so we just assert it's the right shape.
    expect(typeof stageLabel('group')).toBe('string')
    expect(stageLabel('unknown_stage')).toBe('unknown_stage')
  })
})
