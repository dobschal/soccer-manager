import { onClick } from '../lib/htmlEventHandlers.js'
import { el, generateId } from '../lib/html.js'

/**
 * Applies fadeout animation and removes the overlay
 * @param {string} overlayId
 * @param {Array<() => void>} listeners
 */
function fadeOutAndRemove (overlayId, listeners) {
  const overlayEl = el('#' + overlayId)
  if (!overlayEl) return

  listeners.forEach(c => c())
  overlayEl.classList.add('fade-out')

  overlayEl.addEventListener('animationend', () => {
    overlayEl.remove()
  }, { once: true })
}

/**
 * @param {string} title
 * @param {string} subttitle
 * @param {string} text
 * @returns {{onClose: (callback: () => void) => void, remove: () => void}}
 */
export function showOverlay (title, subttitle, text) {
  const closeButtonId = generateId()
  const overlayId = generateId()
  const overlayInnerId = generateId()
  const listeners = []

  onClick('#' + closeButtonId, () => {
    fadeOutAndRemove(overlayId, listeners)
  })

  onClick('#' + overlayId, () => {
    fadeOutAndRemove(overlayId, listeners)
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
      fadeOutAndRemove(overlayId, listeners)
    }
  }
}
