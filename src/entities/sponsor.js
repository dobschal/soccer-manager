/**
 * @typedef {object} SponsorType
 * @property {number} id
 * @property {number} team_id
 * @property {number} value
 * @property {number} start_season
 * @property {number} start_game_day
 * @property {number} duration
 * @property {string} name
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {SponsorType} raw
 * @returns {SponsorType}
 */
export function Sponsor (raw) {
  checkType(raw, {
    id: OptionalNumber,
    team_id: RequiredNumber,
    value: RequiredNumber,
    start_season: RequiredNumber,
    start_game_day: RequiredNumber,
    duration: RequiredNumber,
    name: RequiredString,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
