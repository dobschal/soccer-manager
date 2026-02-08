import { onClick } from '../lib/htmlEventHandlers.js'
import { generateId } from '../lib/html.js'

const STORAGE_KEY_PREFIX = 'managerChatShown_'

/**
 * Checks if the manager chat was already shown for the current game day
 * @param {number} gameDay
 * @param {number} season
 * @returns {boolean}
 */
export function wasManagerChatShown (gameDay, season) {
  const key = `${STORAGE_KEY_PREFIX}${season}_${gameDay}`
  return localStorage.getItem(key) === 'true'
}

/**
 * Marks the manager chat as shown for the current game day
 * @param {number} gameDay
 * @param {number} season
 */
function markManagerChatAsShown (gameDay, season) {
  const key = `${STORAGE_KEY_PREFIX}${season}_${gameDay}`
  localStorage.setItem(key, 'true')
}

/**
 * Shows a manager chat bubble with custom team color and text
 * @param {string} teamColor - Hex color without # (e.g., "3498db")
 * @param {string} text - HTML text to display in the chat bubble
 * @param {number} gameDay - Current game day
 * @param {number} season - Current season
 * @returns {Promise<{ remove: () => void }>}
 */
export async function showManagerChat (teamColor, text, gameDay, season) {
  const containerId = generateId()
  const chatId = generateId()

  // Fetch and modify the SVG
  const response = await fetch('assets/manager.svg')
  let svgContent = await response.text()

  // Replace the red color with team color (case insensitive)
  svgContent = svgContent.replace(/#ff0000/gi, `${teamColor}`)

  const html = `
    <div id="${containerId}" class="manager-chat-container">
      <div id="${chatId}" class="manager-chat-wrapper">
        <div class="manager-chat-bubble">
          ${text}
        </div>
        <div class="manager-chat-image">
          ${svgContent}
        </div>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML('beforeend', html)
  markManagerChatAsShown(gameDay, season)

  const remove = () => {
    const container = document.getElementById(containerId)
    if (container) {
      container.classList.add('manager-chat-fade-out')
      container.addEventListener('animationend', () => {
        container.remove()
      }, { once: true })
    }
  }

  // Close on click outside the chat wrapper
  onClick('#' + containerId, (event) => {
    const chatWrapper = document.getElementById(chatId)
    if (chatWrapper && !chatWrapper.contains(event.target)) {
      remove()
    }
  })

  return { remove }
}
