import { onClick } from '../lib/htmlEventHandlers.js'
import { el, generateId } from '../lib/html.js'

export function showOverlay (title, subttitle, text) {
  const closeButtonId = generateId()
  const overlayId = generateId()
  const overlayInnerId = generateId()
  const listeners = []

  onClick('#' + closeButtonId, () => {
    listeners.forEach(c => c())
    el('#' + overlayId)?.remove()
  })

  onClick('#' + overlayId, () => {
    listeners.forEach(c => c())
    el('#' + overlayId)?.remove()
  })

  onClick('#' + overlayInnerId, event => {
    event.stopPropagation()
  })

  const html = `
    <div id="${overlayId}" class="overlay-backdrop">
      <div id="${overlayInnerId}" class="card overlay">
        <div class="card-body">
          <span id="${closeButtonId}" class="fa fa-close fa-button fa-lg float-end"></span>
          <h5 class="card-title">${title}</h5>
          <h6 class="card-subtitle mb-2 text-muted">${subttitle}</h6>
          <p class="card-text">
            ${text}
          </p>          
        </div>
      </div>
    </div>
  `
  document.body.insertAdjacentHTML('beforeend', html)

  return {
    onClose (callback) {
      listeners.push(callback)
    },
    remove () {
      listeners.forEach(c => c())
      el('#' + overlayId)?.remove()
    }
  }
}
