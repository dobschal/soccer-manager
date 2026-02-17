/**
 * @typedef {object} BuildingType
 * @property {number} id
 * @property {number} team_id
 * @property {string} type
 * @property {number} level
 * @property {number|null} construction_end_game_day
 * @property {number|null} construction_end_season
 * @property {number|null} construction_target_level
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {BuildingType} raw
 * @returns {BuildingType}
 */
export function Building (raw) {
  checkType(raw, {
    id: OptionalNumber,
    team_id: RequiredNumber,
    type: RequiredString,
    level: RequiredNumber,
    construction_end_game_day: OptionalNumber,
    construction_end_season: OptionalNumber,
    construction_target_level: OptionalNumber,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
