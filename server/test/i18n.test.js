import { describe, it, expect } from 'vitest'
import { t } from '../i18n/index.js'

describe('i18n injury translation', () => {
  it('translates all injury types in en and de', () => {
    const types = [
      'bruise', 'muscle_strain', 'ligament_sprain', 'muscle_tear',
      'fracture', 'meniscus_tear', 'acl_tear', 'achilles_rupture'
    ]
    for (const type of types) {
      expect(t(`injury.${type}`, {}, 'en')).not.toBe(`injury.${type}`)
      expect(t(`injury.${type}`, {}, 'de')).not.toBe(`injury.${type}`)
    }
  })

  it('builds the playerInjured log message with a translated injury type (de)', () => {
    const injuryType = t('injury.muscle_tear', {}, 'de')
    const msg = t('log.playerInjured', {
      playerName: 'Marcos Walter',
      injuryType,
      days: 4
    }, 'de')
    expect(msg).toBe('Marcos Walter hat sich verletzt: Muskelfaserriss! Ausfall für 4 Spieltag(e).')
  })

  it('builds the playerInjured log message with a translated injury type (en)', () => {
    const injuryType = t('injury.muscle_tear', {}, 'en')
    const msg = t('log.playerInjured', {
      playerName: 'Marcos Walter',
      injuryType,
      days: 4
    }, 'en')
    expect(msg).toBe('Marcos Walter is injured: Muscle Tear! Out for 4 game day(s).')
  })
})

describe('i18n stand translation', () => {
  it('translates all four stands in en and de', () => {
    for (const stand of ['north', 'south', 'east', 'west']) {
      expect(t(`stand.${stand}`, {}, 'en')).not.toBe(`stand.${stand}`)
      expect(t(`stand.${stand}`, {}, 'de')).not.toBe(`stand.${stand}`)
    }
  })

  it('builds the stadiumExpansionComplete log message with a translated stand (de)', () => {
    const msg = t('log.stadiumExpansionComplete', {
      stand: t('stand.west', {}, 'de'),
      newSize: 12000
    }, 'de')
    expect(msg).toBe('Bau abgeschlossen: Westtribüne hat jetzt 12000 Plätze!')
  })

  it('builds the stadiumExpansionComplete log message with a translated stand (en)', () => {
    const msg = t('log.stadiumExpansionComplete', {
      stand: t('stand.west', {}, 'en'),
      newSize: 12000
    }, 'en')
    expect(msg).toBe('Construction complete: west stand now has 12000 seats!')
  })
})
