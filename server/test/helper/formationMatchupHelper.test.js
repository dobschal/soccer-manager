import { describe, it, expect } from 'vitest'
import { FORMATION_MATCHUPS } from '../../data/formationMatchups.js'
import { bestCountersTo, formationAdvantage } from '../../helper/formationMatchupHelper.js'

describe('FORMATION_MATCHUPS table', () => {
  const formations = Object.keys(FORMATION_MATCHUPS)

  it('covers every formation against every formation', () => {
    expect(formations).toHaveLength(10)
    for (const a of formations) {
      expect(Object.keys(FORMATION_MATCHUPS[a]).sort()).toEqual([...formations].sort())
    }
  })

  it('is antisymmetric with a zero diagonal', () => {
    // A regenerated table that fails this was not built from the
    // (ppg[a][b] - ppg[b][a]) / 2 difference and would tell the model that
    // both sides are favoured at once.
    for (const a of formations) {
      expect(FORMATION_MATCHUPS[a][a]).toBe(0)
      for (const b of formations) {
        expect(FORMATION_MATCHUPS[a][b]).toBeCloseTo(-FORMATION_MATCHUPS[b][a], 10)
      }
    }
  })

  it('keeps the DM/OM against CM edge that the counter-position rule creates', () => {
    // 442a fields DM and OM, 433 fields a lone CM: the CM has no counterpart
    // to fight, and neither do the DM/OM. Documented in the generator header —
    // if this flips, the engine changed and the table is stale.
    expect(formationAdvantage('442a', '433')).toBeGreaterThan(0.1)
  })
})

describe('formationAdvantage', () => {
  it('returns the stored edge', () => {
    expect(formationAdvantage('442a', '433')).toBe(FORMATION_MATCHUPS['442a']['433'])
  })

  it('returns null for formations the table does not know', () => {
    expect(formationAdvantage('4231', '433')).toBeNull()
    expect(formationAdvantage('433', '4231')).toBeNull()
  })
})

describe('bestCountersTo', () => {
  it('lists genuinely favoured shapes, strongest first', () => {
    const counters = bestCountersTo('433')
    expect(counters.length).toBeGreaterThan(0)
    expect(counters[0].advantage).toBeGreaterThanOrEqual(counters[counters.length - 1].advantage)
    for (const counter of counters) {
      expect(counter.advantage).toBeGreaterThanOrEqual(0.06)
      expect(counter.formation).not.toBe('433')
    }
  })

  it('never recommends a shape that only loses by less', () => {
    // The list used to be a plain sort, so an even matchup produced a
    // "counter" with a negative edge.
    for (const formation of Object.keys(FORMATION_MATCHUPS)) {
      for (const counter of bestCountersTo(formation)) {
        expect(counter.advantage).toBeGreaterThan(0)
      }
    }
  })

  it('returns an empty list for an unknown formation', () => {
    expect(bestCountersTo('4231')).toEqual([])
  })

  it('honours the limit', () => {
    expect(bestCountersTo('433', 2)).toHaveLength(2)
  })
})
