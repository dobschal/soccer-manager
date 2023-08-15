import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { goTo } from '../lib/router.js'

/**
 * @param {string} text
 * @param {string} path
 * @returns {string}
 */
export function renderLink (text, path) {
  const id = generateId()
  onClick(id, () => goTo(path))
  return `
    <span id="${id}" class="hover-text">${text}</span>
  `
}
