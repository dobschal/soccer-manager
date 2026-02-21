import { el, generateId } from './html.js'

/** @type {string[]} */
const stack = []

/**
 * Hide all currently visible indicators in the stack.
 */
function _hideAll () {
  for (const id of stack) {
    const indicator = el(id)
    if (indicator) indicator.style.display = 'none'
  }
}

/**
 * Reveal the topmost indicator that is still in the DOM.
 */
function _revealTop () {
  for (let i = stack.length - 1; i >= 0; i--) {
    const indicator = el(stack[i])
    if (indicator) {
      indicator.style.display = ''
      return
    }
  }
}

/**
 * Push a new loading indicator onto the stack and return its ID.
 * Any previously visible indicator is hidden.
 * @param {HTMLElement} domElement - the indicator element to insert into the DOM
 * @returns {string} the generated indicator ID
 */
export function pushLoadingIndicator (domElement) {
  const id = generateId()
  _hideAll()
  domElement.id = id
  stack.push(id)
  return id
}

/**
 * Remove a loading indicator from the stack and the DOM.
 * Reveals the previous indicator if one still exists.
 * @param {string} id
 */
export function popLoadingIndicator (id) {
  el(id)?.remove()
  const index = stack.indexOf(id)
  if (index !== -1) stack.splice(index, 1)
  _revealTop()
}
