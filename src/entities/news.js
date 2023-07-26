/**
 * @typedef {object} NewsType
 * @property {number} id
 * @property {number} game_day
 * @property {number} season
 * @property {string} message
 * @property {number} team_id
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {NewsType} raw
 * @returns {NewsType}
 */
export function News (raw) {
  checkType(raw, {
    id: OptionalNumber,
    game_day: RequiredNumber,
    season: RequiredNumber,
    message: RequiredString,
    team_id: RequiredNumber,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
