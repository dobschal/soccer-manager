import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'

export function toast (text, type = 'info') {
  const id = generateId()

  setTimeout(() => {
    el(`#${id}`)?.remove()
  }, 5000)

  onClick(id, () => {
    el(`#${id}`)?.remove()
  })

  document.body.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast ${type === 'error' ? 'bg-danger' : type === 'success' ? 'bg-success' : 'bg-dark'} text-white  show" data-autohide="false">
      <div class="toast-body">
        ${text}
      </div>
    </div>
  `)
}
