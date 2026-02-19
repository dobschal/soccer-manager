import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'

/**
 * @param {string} text
 * @param {string} [type]
 * @returns {void}
 */
export function toast (text, type = 'info') {
  const id = generateId()

  let container = el('#toast-container')
  if (!container) {
    document.body.insertAdjacentHTML('beforeend', '<div id="toast-container"></div>')
    container = el('#toast-container')
  }

  container.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast ${type === 'error' ? 'bg-danger' : type === 'success' ? 'bg-success' : 'bg-dark'} text-white show" data-autohide="false">
      <div class="toast-body">
        ${text}
      </div>
    </div>
  `)

  setTimeout(() => {
    el(`#${id}`)?.remove()
  }, 5000)

  onClick(id, () => {
    el(`#${id}`)?.remove()
  })
}
