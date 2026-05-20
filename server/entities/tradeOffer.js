/**
 * @typedef {object} TradeOfferType
 * @property {number} id
 * @property {number} offer_value
 * @property {string} type - like "sell" or "buy"
 * @property {number} player_id
 * @property {number} from_team_id
 * @property {number} [game_day]
 * @property {number} [season]
 * @property {number} [allow_instant_buy] - 1 if other users may instant-buy the listed player, 0 if disabled
 * @property {Date} created_at
 */

import { OptionalNullableNumber, OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {TradeOfferType} raw
 * @returns {TradeOfferType}
 */
export function TradeOffer (raw) {
  checkType(raw, {
    id: OptionalNumber,
    offer_value: RequiredNumber,
    type: RequiredString,
    player_id: RequiredNumber,
    from_team_id: RequiredNumber,
    game_day: OptionalNullableNumber,
    season: OptionalNullableNumber,
    allow_instant_buy: OptionalNullableNumber,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
