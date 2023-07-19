/**
 * @typedef {object} TeamType
 * @property {number} id
 * @property {string} name
 * @property {string} formation - like "442", "433", etc
 * @property {number} level
 * @property {number} league
 * @property {number} balance
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
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
