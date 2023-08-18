/**
 * @param {number} delay
 * @returns {Promise<void>}
 */
export function delay (delay) {
  return new Promise(resolve => {
    setTimeout(resolve, delay)
  })
}
