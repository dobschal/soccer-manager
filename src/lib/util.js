/**
 * @template T
 * @param {Array<T>} array
 * @returns {T}
 */
export function randomItem (array) {
  return array[Math.floor((Math.random() * array.length))]
}
