/**
 * @typedef {object} NewsType
 * @property {number} id
 * @property {number} game_day
 * @property {number} season
 * @property {number} level
 * @property {number} league
 * @property {string} type
 * @property {string} title
 * @property {string} text
 * @property {string} locale
 * @property {number} [player_id]
 * @property {number} [team_id]
 * @property {string} [metadata]
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, OptionalString, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {NewsType} raw
 * @returns {NewsType}
 */
export function News (raw) {
  checkType(raw, {
    id: OptionalNumber,
    game_day: RequiredNumber,
    season: RequiredNumber,
    level: RequiredNumber,
    league: RequiredNumber,
    type: RequiredString,
    title: RequiredString,
    text: RequiredString,
    locale: RequiredString,
    player_id: OptionalNumber,
    team_id: OptionalNumber,
    metadata: OptionalString,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
