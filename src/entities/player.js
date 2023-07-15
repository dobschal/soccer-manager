/**
 * @typedef {object} Player
 * @property {number} id
 * @property {string} name
 * @property {number} level
 * @property {string} position - like GK, LD, CD, RD, LM, ...
 * @property {string} in_game_position
 * @property {number} team_id
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, OptionalString, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {Player} raw
 * @returns {Player}
 */
export function Player (raw) {
  checkType(raw, {
    id: OptionalNumber,
    team_id: RequiredNumber,
    name: RequiredString,
    position: RequiredString,
    in_game_position: OptionalString,
    level: RequiredNumber,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
