/**
 * @typedef {object} StadiumType
 * @property {number} id
 * @property {number} team_id
 * @property {number} north_stand_size
 * @property {number} south_stand_size
 * @property {number} east_stand_size
 * @property {number} west_stand_size
 * @property {number} north_stand_price
 * @property {number} south_stand_price
 * @property {number} east_stand_price
 * @property {number} west_stand_price
 * @property {number} north_stand_roof
 * @property {number} south_stand_roof
 * @property {number} east_stand_roof
 * @property {number} west_stand_roof
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, checkType } from '../lib/type-checker.js'

/**
 * @param {StadiumType} raw
 * @returns {StadiumType}
 */
export function Stadium (raw) {
  checkType(raw, {
    id: OptionalNumber,
    team_id: RequiredNumber,
    north_stand_size: RequiredNumber,
    south_stand_size: RequiredNumber,
    east_stand_size: RequiredNumber,
    west_stand_size: RequiredNumber,
    north_stand_price: RequiredNumber,
    south_stand_price: RequiredNumber,
    east_stand_price: RequiredNumber,
    west_stand_price: RequiredNumber,
    north_stand_roof: RequiredNumber,
    south_stand_roof: RequiredNumber,
    east_stand_roof: RequiredNumber,
    west_stand_roof: RequiredNumber,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
