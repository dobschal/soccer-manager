import { showOverlay } from './overlay.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'

/**
 * @param {string} title
 * @param {string} text
 * @param {string} buttonText
 * @param {boolean} hasInput
 * @param {string} inputType
 * @param {string} inputLabel
 * @returns {Promise<{ok: boolean, value: string}>}
 */
export function showDialog ({ title, text, buttonText, hasInput, inputType, inputLabel }) {
  return new Promise(resolve => {
    const submitButtonId = generateId()
    const cancelButtonId = generateId()
    const inputId = generateId()

    onClick(cancelButtonId, () => {
      resolve({ ok: false, value: undefined })
      overlay.remove()
    })

    onClick(submitButtonId, () => {
      const inputValue = el('#' + inputId)?.value
      resolve({ ok: true, value: inputValue })
      overlay.remove()
    })

    const overlay = showOverlay(
      title,
      '',
    `
      <p>
       ${text}
      </p>
      <p class="${hasInput ? '' : 'hidden'}">
        <input type="${inputType ?? 'text'}" id="${inputId}" placeholder="${inputLabel ?? title}">
      </p>
      <button id="${cancelButtonId}" type="button" class="btn btn-secondary">Cancel</button>
      <button id="${submitButtonId}" type="button" class="btn btn-primary">${buttonText ?? 'OK'}</button>
    `
    )
  })
}
