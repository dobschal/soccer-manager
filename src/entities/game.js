/**
 * @typedef {Object} Game
 * @property {number} id
 * @property {number} season
 * @property {number} game_day
 * @property {number} team_1_id
 * @property {number} team_2_id
 * @property {number} played - 1: played, 0: not played yet
 * @property {string} details - JSON string of the details
 * @property {number} goals_team_1
 * @property {number} goals_team_2
 * @property {string} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {Game} raw
 * @returns {Game}
 */
export function Game (raw) {
  checkType(raw, {
    id: OptionalNumber,
    season: RequiredNumber,
    game_day: RequiredNumber,
    team_1_id: RequiredNumber,
    team_2_id: RequiredNumber,
    played: RequiredNumber,
    details: RequiredString,
    goals_team_1: OptionalNumber,
    goals_team_2: OptionalNumber,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
