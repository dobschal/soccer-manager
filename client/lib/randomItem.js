/**
 * @param {Array} array
 * @returns {*}
 */
export function randomItem (array) {
  return array[Math.floor((Math.random() * array.length))]
}
