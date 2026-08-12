import { describe, it, expect } from 'vitest'
import {
  getPositionPenalty,
  getPositionLevelFactor,
  GOALKEEPER_MISMATCH_PENALTY
} from '../../util/player.js'

describe('getPositionPenalty (#540)', () => {
  it('costs nothing at the natural position', () => {
    for (const pos of ['GK', 'CD', 'CM', 'CA', 'RA', 'LD']) {
      expect(getPositionPenalty(pos, pos)).toBe(0)
    }
  })

  describe('attacker', () => {
    it('loses 10% elsewhere in the front line', () => {
      expect(getPositionPenalty('RA', 'CA')).toBeCloseTo(0.1)
      expect(getPositionPenalty('RA', 'LA')).toBeCloseTo(0.1)
    })

    it('loses 20% in midfield', () => {
      for (const slot of ['RM', 'OM', 'DM', 'CM', 'LM']) {
        expect(getPositionPenalty('RA', slot)).toBeCloseTo(0.2)
      }
    })

    it('loses 30% in defence', () => {
      for (const slot of ['RD', 'CD', 'LD']) {
        expect(getPositionPenalty('RA', slot)).toBeCloseTo(0.3)
      }
    })
  })

  describe('midfielder', () => {
    it('loses 10% elsewhere in midfield', () => {
      expect(getPositionPenalty('CM', 'LM')).toBeCloseTo(0.1)
      expect(getPositionPenalty('DM', 'OM')).toBeCloseTo(0.1)
    })

    it('loses 20% in attack and in defence alike', () => {
      expect(getPositionPenalty('CM', 'CA')).toBeCloseTo(0.2)
      expect(getPositionPenalty('CM', 'CD')).toBeCloseTo(0.2)
    })
  })

  describe('defender', () => {
    it('loses 10% elsewhere in defence', () => {
      expect(getPositionPenalty('CD', 'LD')).toBeCloseTo(0.1)
      expect(getPositionPenalty('RD', 'CD')).toBeCloseTo(0.1)
    })

    it('loses 20% in midfield', () => {
      expect(getPositionPenalty('CD', 'CM')).toBeCloseTo(0.2)
    })

    it('loses 30% in attack', () => {
      expect(getPositionPenalty('CD', 'CA')).toBeCloseTo(0.3)
    })
  })

  describe('goalkeeper', () => {
    it('costs an outfield player half their level to go in goal', () => {
      for (const natural of ['CD', 'CM', 'CA']) {
        expect(getPositionPenalty(natural, 'GK')).toBe(GOALKEEPER_MISMATCH_PENALTY)
      }
    })

    it('costs a keeper the same to play outfield', () => {
      expect(getPositionPenalty('GK', 'CD')).toBe(GOALKEEPER_MISMATCH_PENALTY)
      expect(getPositionPenalty('GK', 'CA')).toBe(GOALKEEPER_MISMATCH_PENALTY)
    })
  })

  it('never exceeds the goalkeeper penalty', () => {
    const all = ['GK', 'LD', 'CD', 'RD', 'DM', 'LM', 'CM', 'RM', 'OM', 'LA', 'CA', 'RA']
    for (const from of all) {
      for (const to of all) {
        const penalty = getPositionPenalty(from, to)
        expect(penalty).toBeGreaterThanOrEqual(0)
        expect(penalty).toBeLessThanOrEqual(GOALKEEPER_MISMATCH_PENALTY)
      }
    }
  })

  it('is milder than the flat 50% it replaced for every outfield mismatch', () => {
    expect(getPositionPenalty('RA', 'CD')).toBeLessThan(0.5)
    expect(getPositionPenalty('CD', 'CA')).toBeLessThan(0.5)
  })

  it('treats unknown or missing positions as no penalty', () => {
    expect(getPositionPenalty('', 'CM')).toBe(0)
    expect(getPositionPenalty('CM', null)).toBe(0)
    expect(getPositionPenalty('XX', 'CM')).toBe(0)
  })
})

describe('getPositionLevelFactor (#540)', () => {
  it('is the complement of the penalty', () => {
    expect(getPositionLevelFactor('CM', 'CM')).toBe(1)
    expect(getPositionLevelFactor('RA', 'CA')).toBeCloseTo(0.9)
    expect(getPositionLevelFactor('RA', 'CD')).toBeCloseTo(0.7)
    expect(getPositionLevelFactor('CM', 'GK')).toBeCloseTo(0.5)
  })
})
