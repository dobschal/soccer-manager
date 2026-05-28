/**
 * @typedef {object} MatchDayRecapType
 * @property {number} id
 * @property {number} game_day
 * @property {number} season
 * @property {number} level
 * @property {number} league
 * @property {string} locale
 * @property {string} title
 * @property {string} text
 * @property {number} [image_player_id]
 * @property {number} [image_team_id]
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {MatchDayRecapType} raw
 * @returns {MatchDayRecapType}
 */
export function MatchDayRecap (raw) {
  checkType(raw, {
    id: OptionalNumber,
    game_day: RequiredNumber,
    season: RequiredNumber,
    level: RequiredNumber,
    league: RequiredNumber,
    locale: RequiredString,
    title: RequiredString,
    text: RequiredString,
    image_player_id: OptionalNumber,
    image_team_id: OptionalNumber,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
