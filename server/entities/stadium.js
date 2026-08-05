/**
 * @typedef {object} StadiumType
 * @property {number} id
 * @property {number} team_id
 * @property {string} [name]
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
 * @property {number} [corner_ne_stand_size]
 * @property {number} [corner_nw_stand_size]
 * @property {number} [corner_se_stand_size]
 * @property {number} [corner_sw_stand_size]
 * @property {number} [corner_ne_stand_price]
 * @property {number} [corner_nw_stand_price]
 * @property {number} [corner_se_stand_price]
 * @property {number} [corner_sw_stand_price]
 * @property {number} [corner_ne_stand_roof]
 * @property {number} [corner_nw_stand_roof]
 * @property {number} [corner_se_stand_roof]
 * @property {number} [corner_sw_stand_roof]
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, OptionalString, RequiredNumber, checkType } from '../lib/type-checker.js'

/**
 * @param {StadiumType} raw
 * @returns {StadiumType}
 */
export function Stadium (raw) {
  checkType(raw, {
    id: OptionalNumber,
    team_id: RequiredNumber,
    name: OptionalString,
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
    corner_ne_stand_size: OptionalNumber,
    corner_nw_stand_size: OptionalNumber,
    corner_se_stand_size: OptionalNumber,
    corner_sw_stand_size: OptionalNumber,
    corner_ne_stand_price: OptionalNumber,
    corner_nw_stand_price: OptionalNumber,
    corner_se_stand_price: OptionalNumber,
    corner_sw_stand_price: OptionalNumber,
    corner_ne_stand_roof: OptionalNumber,
    corner_nw_stand_roof: OptionalNumber,
    corner_se_stand_roof: OptionalNumber,
    corner_sw_stand_roof: OptionalNumber,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
