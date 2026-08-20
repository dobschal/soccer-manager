import { describe, it, expect } from 'vitest'
import { actionCardLabel } from '../../lib/actionCardLabels.js'
import en from '../../i18n/en.js'
import de from '../../i18n/de.js'
import { actionCardChances } from '../../../server/helper/actionCardHelper.js'

const ACTION_TYPES = Object.keys(actionCardChances)

describe('actionCardLabels', () => {
  it('covers every action card type the server can hand out', () => {
    for (const action of ACTION_TYPES) {
      // The fallback returns the raw enum name — that's the bug we guard against.
      expect(actionCardLabel(action), `missing label for ${action}`).not.toBe(action)
    }
  })

  it('has an en and de translation plus description for every type', () => {
    for (const action of ACTION_TYPES) {
      const label = actionCardLabel(action)
      const key = Object.keys(en).find(k => en[k] === label)
      expect(key, `no en key resolved for ${action}`).toBeTruthy()
      expect(de[key], `missing de translation for ${key}`).toBeTruthy()
      expect(en[`${key}Desc`], `missing en description for ${key}`).toBeTruthy()
      expect(de[`${key}Desc`], `missing de description for ${key}`).toBeTruthy()
    }
  })

  it('falls back to the raw action for unknown types', () => {
    expect(actionCardLabel('NOPE')).toBe('NOPE')
  })
})
