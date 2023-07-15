/**
 * @typedef {object} Team
 * @property {number} id
 * @property {string} name
 * @property {string} formation - like "442", "433", etc
 * @property {number} level
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {Team} raw
 * @returns {Team}
 */
export function Team (raw) {
  checkType(raw, {
    id: OptionalNumber,
    name: RequiredString,
    level: RequiredNumber,
    formation: RequiredString,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
