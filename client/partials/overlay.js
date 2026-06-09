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
 * Applies swipe-down animation and removes the overlay
 * @param {string} overlayId
 * @param {string} overlayInnerId
 * @param {Array<() => void>} listeners
 * @param {number} currentOffset - Current swipe offset in pixels
 */
function swipeDownAndRemove (overlayId, overlayInnerId, listeners, currentOffset = 0) {
  const overlayEl = el('#' + overlayId)
  const innerEl = el('#' + overlayInnerId)
  if (!overlayEl) return

  listeners.forEach(c => c())

  if (innerEl) {
    innerEl.style.setProperty('--swipe-offset', `${currentOffset}px`)
  }
  overlayEl.classList.add('swipe-down')

  overlayEl.addEventListener('animationend', () => {
    overlayEl.remove()
  }, { once: true })
}

/**
 * Sets up touch swipe-to-close functionality for the overlay
 * @param {string} overlayId
 * @param {string} overlayInnerId
 * @param {Array<() => void>} listeners
 */
function setupTouchSwipe (overlayId, overlayInnerId, listeners) {
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  if (!isTouchDevice) return

  const backdropEl = el('#' + overlayId) // The full-screen backdrop
  const innerEl = el('#' + overlayInnerId) // The scrollable card we animate
  if (!backdropEl || !innerEl) return

  let touchStartY = 0
  let touchCurrentY = 0
  let isSwiping = false
  let startedAtTop = false
  const swipeThreshold = 80

  backdropEl.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY
    touchCurrentY = touchStartY
    // Remember if we started at the top - only then can we potentially close
    startedAtTop = innerEl.scrollTop <= 0
    isSwiping = false // Will be set to true on first downward move if conditions are met
  }, { passive: true })

  backdropEl.addEventListener('touchmove', (e) => {
    const isScrolledToTop = innerEl.scrollTop <= 0
    const isNotScrollable = innerEl.scrollHeight <= innerEl.clientHeight

    touchCurrentY = e.touches[0].clientY
    const deltaY = touchCurrentY - touchStartY

    // If we're swiping and scroll position changed, cancel the swipe
    if (isSwiping && !isScrolledToTop) {
      isSwiping = false
      innerEl.style.transform = ''
      innerEl.style.transition = ''
      return
    }

    // Start swipe gesture if: at top, swiping down, and (started at top OR content not scrollable)
    if (isScrolledToTop && deltaY > 0 && (startedAtTop || isNotScrollable)) {
      if (!isSwiping) {
        isSwiping = true
      }
      // Apply visual feedback - move overlay down as user swipes
      const offset = Math.min(deltaY * 0.5, 150)
      innerEl.style.transform = `translateY(${offset}px)`
      innerEl.style.transition = 'none'
    } else if (isSwiping && deltaY <= 0) {
      // User reversed direction, cancel swipe
      isSwiping = false
      innerEl.style.transform = ''
      innerEl.style.transition = ''
    }
  }, { passive: true })

  backdropEl.addEventListener('touchend', () => {
    if (!isSwiping) return

    const deltaY = touchCurrentY - touchStartY

    if (deltaY > swipeThreshold) {
      // Swipe was far enough, close the overlay
      const currentOffset = Math.min(deltaY * 0.5, 150)
      swipeDownAndRemove(overlayId, overlayInnerId, listeners, currentOffset)
    } else {
      // Swipe wasn't far enough, reset position
      innerEl.style.transform = ''
      innerEl.style.transition = 'transform 0.2s ease-out'
      setTimeout(() => {
        innerEl.style.transition = ''
      }, 200)
    }

    isSwiping = false
  }, { passive: true })
}

/**
 * Shows a confirm dialog as an overlay. Works in WKWebView unlike native confirm().
 * @param {string} message - The confirmation message
 * @param {string} confirmLabel - Label for the confirm button
 * @param {string} cancelLabel - Label for the cancel button
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog (message, confirmLabel = 'OK', cancelLabel = 'Cancel') {
  return new Promise((resolve) => {
    const confirmBtnId = generateId()
    const cancelBtnId = generateId()

    const content = `
      <p class="confirm-dialog-message">${message}</p>
      <div class="d-flex gap-2 mt-3">
        <button id="${cancelBtnId}" class="btn btn-outline-secondary flex-fill">${cancelLabel}</button>
        <button id="${confirmBtnId}" class="btn btn-info flex-fill">${confirmLabel}</button>
      </div>
    `

    const overlay = showOverlay('', '', content, { hideHeader: true })
    let resolved = false

    overlay.onClose(() => {
      if (!resolved) {
        resolved = true
        resolve(false)
      }
    })

    setTimeout(() => {
      const confirmBtn = el('#' + confirmBtnId)
      const cancelBtn = el('#' + cancelBtnId)

      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          resolved = true
          overlay.remove()
          resolve(true)
        })
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          resolved = true
          overlay.remove()
          resolve(false)
        })
      }
    }, 0)
  })
}

/**
 * @param {string} title
 * @param {string} subttitle
 * @param {string} text
 * @param {{ hideHeader?: boolean }} [options]
 * @returns {{onClose: (callback: () => void) => void, remove: () => void}}
 */
export function showOverlay (title, subttitle, text, options = {}) {
  const closeButtonId = generateId()
  const overlayId = generateId()
  const overlayInnerId = generateId()
  const listeners = []

  onClick('#' + closeButtonId, () => {
    fadeOutAndRemove(overlayId, listeners)
  })

  onClick('#' + overlayId, (event) => {
    // Only close on actual mouse clicks on the backdrop, not keyboard-triggered events
    if (event.target.id !== overlayId) return
    fadeOutAndRemove(overlayId, listeners)
  })

  onClick('#' + overlayInnerId, event => {
    // Close overlay when clicking an internal navigation link inside it.
    // External links (target="_blank") leave the overlay open so the user
    // can resume reading once they return from the new tab.
    const anchor = event.target.closest('a[href]')
    if (anchor && anchor.target !== '_blank') {
      fadeOutAndRemove(overlayId, listeners)
      return
    }
    event.stopPropagation()
  })

  const headerHtml = options.hideHeader
    ? ''
    : `
        <div class="card-header overlay-header border-0">
            <div>
              <h3 class="card-title mb-0">${title}</h3>
              <span class="card-subtitle text-muted mb-0">${subttitle}</span>
            </div>
            <span id="${closeButtonId}" class="fa fa-close overlay-close-btn"></span>
        </div>
      `

  const html = `
    <div id="${overlayId}" class="overlay-backdrop">
      <div id="${overlayInnerId}" class="card overlay">
        ${headerHtml}
        <div class="card-body">
            ${text}
        </div>
      </div>
    </div>
  `
  document.body.insertAdjacentHTML('beforeend', html)

  setupTouchSwipe(overlayId, overlayInnerId, listeners)

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      fadeOutAndRemove(overlayId, listeners)
    }
  }
  document.addEventListener('keydown', onKeyDown)
  listeners.push(() => document.removeEventListener('keydown', onKeyDown))

  return {
    onClose (callback) {
      listeners.push(callback)
    },
    remove () {
      fadeOutAndRemove(overlayId, listeners)
    }
  }
}
