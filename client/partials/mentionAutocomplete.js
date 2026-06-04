import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'

const SEARCH_DEBOUNCE_MS = 200
const MENTION_TRIGGER = /(^|\s)@([A-Za-z0-9_.-]{1,30})$/

function escapeHtml (text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Attach an @-mention autocomplete dropdown to a textarea/input element.
 * Searches users by username, allows mouse + keyboard (arrows + enter) selection.
 *
 * @param {HTMLTextAreaElement|HTMLInputElement} input
 * @returns {{ destroy: () => void }}
 */
export function attachMentionAutocomplete (input) {
  if (!input) return { destroy: () => {} }

  const dropdown = document.createElement('div')
  dropdown.className = 'mention-autocomplete'
  dropdown.hidden = true
  document.body.appendChild(dropdown)

  let activeIndex = 0
  let currentSuggestions = []
  let currentQuery = ''
  let debounceTimer = null

  const hide = () => {
    dropdown.hidden = true
    dropdown.innerHTML = ''
    currentSuggestions = []
    activeIndex = 0
  }

  const positionDropdown = () => {
    const rect = input.getBoundingClientRect()
    // Position below the input. Could be more precise by computing caret coords,
    // but a fixed anchor at the textarea bottom-left is good enough and stable.
    const scrollY = window.scrollY || window.pageYOffset
    const scrollX = window.scrollX || window.pageXOffset
    dropdown.style.top = `${rect.bottom + scrollY + 4}px`
    dropdown.style.left = `${rect.left + scrollX}px`
    dropdown.style.minWidth = `${Math.min(rect.width, 320)}px`
  }

  const render = () => {
    if (currentSuggestions.length === 0) {
      dropdown.innerHTML = `<div class="mention-autocomplete-empty">${t('forum.mentionNoResults')}</div>`
      dropdown.hidden = false
      positionDropdown()
      return
    }
    dropdown.innerHTML = currentSuggestions.map((u, i) => `
      <button type="button" class="mention-autocomplete-item${i === activeIndex ? ' is-active' : ''}" data-username="${escapeHtml(u.username)}">
        <i class="fa fa-user"></i> ${escapeHtml(u.username)}
      </button>
    `).join('')
    dropdown.hidden = false
    positionDropdown()

    dropdown.querySelectorAll('.mention-autocomplete-item').forEach((btn, i) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        activeIndex = i
        commitSelection()
      })
    })
  }

  const commitSelection = () => {
    if (!currentSuggestions.length) {
      hide()
      return
    }
    const username = currentSuggestions[activeIndex]?.username
    if (!username) return hide()

    const cursorPos = input.selectionStart ?? input.value.length
    const before = input.value.slice(0, cursorPos)
    const after = input.value.slice(cursorPos)
    const triggerMatch = MENTION_TRIGGER.exec(before)
    if (!triggerMatch) {
      hide()
      return
    }
    const startIndex = before.length - triggerMatch[2].length
    const newBefore = before.slice(0, startIndex) + username + ' '
    input.value = newBefore + after
    const newCursor = newBefore.length
    input.setSelectionRange(newCursor, newCursor)
    input.focus()
    input.dispatchEvent(new Event('input', { bubbles: true }))
    hide()
  }

  const queryServer = async (q) => {
    if (q.length < 1) {
      currentSuggestions = []
      hide()
      return
    }
    try {
      const { users } = await server.searchUsersForMention(q)
      currentSuggestions = (users || []).slice(0, 8)
      activeIndex = 0
      render()
    } catch {
      hide()
    }
  }

  const onInput = () => {
    const cursorPos = input.selectionStart ?? input.value.length
    const before = input.value.slice(0, cursorPos)
    const m = MENTION_TRIGGER.exec(before)
    if (!m) {
      hide()
      return
    }
    currentQuery = m[2]
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => queryServer(currentQuery), SEARCH_DEBOUNCE_MS)
  }

  const onKeyDown = (e) => {
    if (dropdown.hidden || currentSuggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIndex = (activeIndex + 1) % currentSuggestions.length
      render()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIndex = (activeIndex - 1 + currentSuggestions.length) % currentSuggestions.length
      render()
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      commitSelection()
    } else if (e.key === 'Escape') {
      hide()
    }
  }

  const onBlur = () => {
    // Delay so the click event on a dropdown item still fires.
    setTimeout(hide, 150)
  }

  input.addEventListener('input', onInput)
  input.addEventListener('keydown', onKeyDown)
  input.addEventListener('blur', onBlur)

  return {
    destroy () {
      input.removeEventListener('input', onInput)
      input.removeEventListener('keydown', onKeyDown)
      input.removeEventListener('blur', onBlur)
      if (debounceTimer) clearTimeout(debounceTimer)
      dropdown.remove()
    }
  }
}
