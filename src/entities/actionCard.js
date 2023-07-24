/**
 * @typedef {object} ActionCardType
 * @property {number} id
 * @property {number} team_id
 * @property {string} action
 * @property {number} played
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {ActionCardType} raw
 * @returns {ActionCardType}
 */
export function ActionCard (raw) {
  checkType(raw, {
    id: OptionalNumber,
    team_id: RequiredNumber,
    action: RequiredString,
    played: RequiredNumber,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
