/**
 * @typedef {object} NewsCommentType
 * @property {number} id
 * @property {number} news_id
 * @property {number} user_id
 * @property {string} text
 * @property {Date} created_at
 */

import { OptionalNumber, OptionalObject, RequiredNumber, RequiredString, checkType } from '../lib/type-checker.js'

/**
 * @param {NewsCommentType} raw
 * @returns {NewsCommentType}
 */
export function NewsComment (raw) {
  checkType(raw, {
    id: OptionalNumber,
    news_id: RequiredNumber,
    user_id: RequiredNumber,
    text: RequiredString,
    created_at: OptionalObject
  })
  for (const key in raw) {
    if (Object.hasOwnProperty.call(raw, key)) {
      this[key] = raw[key]
    }
  }
}
