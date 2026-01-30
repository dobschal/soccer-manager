/**
 * @param {*} data
 * @returns {*}
 */
export function deepCopy (data) {
  return JSON.parse(JSON.stringify(data))
}
