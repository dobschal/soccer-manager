/**
 * @typedef {object} LogMessageType
 * @property {number} id
 * @property {number} game_day
 * @property {number} season
 * @property {string} message
 * @property {number} team_id
 * @property {string} [action]
 * @property {number} [action_value]
 * @property {string} [icon]
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, OptionalString, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {LogMessageType} raw
 * @returns {LogMessageType}
 */
export function LogMessage (raw) {
  checkType(raw, {
    id: OptionalNumber,
    game_day: RequiredNumber,
    season: RequiredNumber,
    message: RequiredString,
    team_id: RequiredNumber,
    action: OptionalString,
    action_value: OptionalNumber,
    icon: OptionalString,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
