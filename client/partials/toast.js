import { el, generateId, html } from '../lib/html.js'

export function toast (text, type = 'info') {
  const id = generateId()

  setTimeout(() => {
    el(`#${id}`)?.remove()
  }, 3000)

  document.body.insertAdjacentHTML('beforeend', html(`
    <div id="${id}" class="toast ${type} show" data-autohide="false">
      <div class="toast-body">
        ${text}
      </div>
    </div>
  `))
}
