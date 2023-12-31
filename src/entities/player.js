/**
 * @typedef {object} PlayerType
 * @property {number} id
 * @property {string} name
 * @property {number} level
 * @property {string} position - like GK, LD, CD, RD, LM, ...
 * @property {string} in_game_position
 * @property {number} team_id
 * @property {number} freshness
 * @property {number} hair_color
 * @property {number} skin_color
 * @property {Date} created_at
 * @property {number} carrier_start_season - season where the player was 16 years old
 * @property {number} carrier_end_season - start_seaon + 20 (+ 3 years)
 */

import { OptionalNumber, OptionalObject, OptionalString, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {PlayerType} raw
 * @returns {PlayerType}
 */
export function Player (raw) {
  checkType(raw, {
    id: OptionalNumber,
    team_id: RequiredNumber,
    name: RequiredString,
    position: RequiredString,
    in_game_position: OptionalString,
    level: RequiredNumber,
    hair_color: RequiredNumber,
    skin_color: RequiredNumber,
    created_at: OptionalObject,
    carrier_start_season: RequiredNumber,
    carrier_end_season: RequiredNumber,
    freshness: RequiredNumber
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
