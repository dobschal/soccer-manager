let count = 0

/**
 * This is just to get Syntax Highlighting for HTML inside Javascript...
 *
 * @param {string} string
 * @returns {string}
 */
export const html = (string) => {
  return string
}

/**
 * Get the value of an input field or any other HTML Element
 *
 * @param {string} query
 * @returns {string}
 */
export function value (query) {
  const el = document.querySelector(query)
  if (!el) throw new Error('No element found for ' + query)
  if (typeof el.value !== 'undefined') return el.value
  return el.innerText
}

/**
 * @param {string} query
 * @returns {HTMLElement}
 */
export function el (query) {
  return document.querySelector(query)
}

/**
 * Returns a unique incremented ID to be used for referencing HTML elements.
 *
 * @returns {number}
 */
export function generateId () {
  return `_${count++}`
}
