import { showOverlay } from './overlay.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { t } from '../i18n/index.js'

/**
 * @param {string} title
 * @param {string} text
 * @param {string} buttonText
 * @param {boolean} hasInput
 * @param {string} inputType
 * @param {string} inputLabel
 * @param {string} [buttonType]
 * @param {string} [secondaryButtonText]
 * @param {string} [secondaryButtonType]
 * @returns {Promise<{ok: boolean, value: string}>}
 */
export function showDialog ({ title, text, buttonText, hasInput, inputType, inputLabel, buttonType = 'primary', secondaryButtonText, secondaryButtonType = 'warning' }) {
  return new Promise(resolve => {
    const submitButtonId = generateId()
    const cancelButtonId = generateId()
    const secondaryButtonId = generateId()
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

    if (secondaryButtonText) {
      onClick(secondaryButtonId, () => {
        resolve({ ok: false, value: 'secondary' })
        overlay.remove()
      })
    }

    const secondaryButton = secondaryButtonText
      ? `<button id="${secondaryButtonId}" type="button" class="btn btn-${secondaryButtonType}">${secondaryButtonText}</button>`
      : ''

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
      <button id="${cancelButtonId}" type="button" class="btn btn-secondary">${t('dialog.cancel')}</button>
      ${secondaryButton}
      <button id="${submitButtonId}" type="button" class="btn btn-${buttonType}">${buttonText ?? 'OK'}</button>
    `
    )
  })
}
