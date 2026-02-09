/**
 * @typedef {object} YouthPlayerType
 * @property {number} id
 * @property {number} team_id
 * @property {string} name
 * @property {string} position - like GK, LD, CD, RD, LM, ...
 * @property {number} level - 0.1 to ~3.0
 * @property {number} talent - hidden, 0-1
 * @property {number} moral - visible, 0-1
 * @property {number} fitness - visible, 0-1
 * @property {number} hair_color
 * @property {number} skin_color
 * @property {number} birth_season - season when player was 15
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {YouthPlayerType} raw
 * @returns {YouthPlayerType}
 */
export function YouthPlayer (raw) {
  checkType(raw, {
    id: OptionalNumber,
    team_id: RequiredNumber,
    name: RequiredString,
    position: RequiredString,
    level: RequiredNumber,
    talent: RequiredNumber,
    moral: RequiredNumber,
    fitness: RequiredNumber,
    hair_color: RequiredNumber,
    skin_color: RequiredNumber,
    birth_season: RequiredNumber,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
