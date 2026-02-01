/**
 * @typedef {object} TradeHistoryType
 * @property {number} id
 * @property {number} game_day
 * @property {number} season
 * @property {number} price
 * @property {number} player_id
 * @property {number} from_team_id
 * @property {number} to_team_id
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, checkType } from '../lib/type-checker.js'

/**
 * @param {TradeHistoryType} raw
 * @returns {TradeHistoryType}
 */
export function TradeHistory (raw) {
  checkType(raw, {
    id: OptionalNumber,
    player_id: RequiredNumber,
    from_team_id: RequiredNumber,
    to_team_id: RequiredNumber,
    price: RequiredNumber,
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
