/**
 * @typedef {object} PlayerHistoryType
 * @property {number} id
 * @property {number} player_id
 * @property {string} type
 * @property {string} value
 * @property {number} season
 * @property {number} game_day
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {PlayerHistoryType} raw
 * @returns {PlayerHistoryType}
 */
export function PlayerHistory (raw) {
  checkType(raw, {
    id: OptionalNumber,
    player_id: RequiredNumber,
    type: RequiredString,
    value: RequiredString,
    game_day: RequiredNumber,
    season: RequiredNumber,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
