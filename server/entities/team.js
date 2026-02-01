/**
 * @typedef {object} TeamType
 * @property {number} id
 * @property {string} name
 * @property {string} formation - like "442", "433", etc
 * @property {number} level
 * @property {string} color
 * @property {number} league
 * @property {number} balance
 * @property {number} user_id
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {TeamType} raw
 * @returns {TeamType}
 */
export function Team (raw) {
  checkType(raw, {
    id: OptionalNumber,
    name: RequiredString,
    level: RequiredNumber,
    balance: RequiredNumber,
    league: OptionalNumber,
    formation: RequiredString,
    color: RequiredString,
    created_at: OptionalObject,
    user_id: OptionalNumber
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
