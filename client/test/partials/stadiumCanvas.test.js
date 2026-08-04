import { describe, expect, it } from 'vitest'
import { StadiumCanvas } from '../../partials/stadiumCanvas.js'

/**
 * These tests target the pure stand-sizing math (`_standRowCount`), which drives
 * how big each stand looks. They don't touch Three.js / WebGL — the method only
 * depends on its arguments.
 */
describe('StadiumCanvas._standRowCount', () => {
  const canvas = new StadiumCanvas({}, {})

  // north/south stands are as wide as the field (+6), east/west as deep (+6).
  const NS_WIDTH = 56
  const EW_WIDTH = 36

  it('grows monotonically with seat count', () => {
    const sizes = [1000, 5000, 10000, 15000, 20000, 30000]
    const rows = sizes.map(s => canvas._standRowCount(s, NS_WIDTH))
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]).toBeGreaterThan(rows[i - 1])
    }
  })

  it('makes a 30k stand clearly larger than a 15k stand (regression)', () => {
    // The old divider-based formula saturated here: 15k and 30k came out nearly
    // the same size (~19% apart). A doubling of seats must be clearly visible.
    const rows15k = canvas._standRowCount(15000, NS_WIDTH)
    const rows30k = canvas._standRowCount(30000, NS_WIDTH)
    expect(rows30k / rows15k).toBeGreaterThan(1.3)
  })

  it('never returns fewer than the 3-row minimum', () => {
    expect(canvas._standRowCount(0, NS_WIDTH)).toBe(3)
    expect(canvas._standRowCount(1, NS_WIDTH)).toBeGreaterThanOrEqual(3)
    expect(canvas._standRowCount(100, NS_WIDTH)).toBeGreaterThanOrEqual(3)
  })

  it('makes a narrower stand deeper for the same seat count', () => {
    // A narrower stand fits fewer seats per row, so it needs more rows.
    const wide = canvas._standRowCount(15000, NS_WIDTH)
    const narrow = canvas._standRowCount(15000, EW_WIDTH)
    expect(narrow).toBeGreaterThan(wide)
  })

  it('keeps even a mega-stand at a sane depth', () => {
    // Guard against the linear-growth failure mode (hundreds of rows deep).
    expect(canvas._standRowCount(30000, NS_WIDTH)).toBeLessThan(100)
  })
})

describe('StadiumCanvas._standTierRows', () => {
  const canvas = new StadiumCanvas({}, {})

  it('stays single-tier below 10000 seats', () => {
    const result = canvas._standTierRows(9999, 60)
    expect(result.twoTier).toBe(false)
    expect(result.lowerRows).toBe(60)
    expect(result.upperRows).toBe(0)
  })

  it('becomes two-tier at 10000 seats', () => {
    expect(canvas._standTierRows(10000, 60).twoTier).toBe(true)
  })

  it('puts ~2/3 of the rows in the lower tier and ~1/3 in the upper', () => {
    const { lowerRows, upperRows } = canvas._standTierRows(15000, 60)
    expect(lowerRows).toBe(40)
    expect(upperRows).toBe(20)
  })

  it('always accounts for every row across both tiers', () => {
    for (const rows of [30, 42, 59, 73]) {
      const { lowerRows, upperRows } = canvas._standTierRows(20000, rows)
      expect(lowerRows + upperRows).toBe(rows)
      expect(lowerRows).toBeGreaterThan(upperRows)
    }
  })
})
