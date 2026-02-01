/**
 * @typedef {Object} FinanceLogType
 * @property {number} id
 * @property {number} season
 * @property {number} game_day
 * @property {number} team_id
 * @property {number} value
 * @property {number} balance
 * @property {string} reason
 * @property {string} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {FinanceLogType} raw
 * @returns {FinanceLogType}
 */
export function FinanceLog (raw) {
  checkType(raw, {
    id: OptionalNumber,
    season: RequiredNumber,
    game_day: RequiredNumber,
    team_id: RequiredNumber,
    value: RequiredNumber,
    balance: RequiredNumber,
    reason: RequiredString,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
