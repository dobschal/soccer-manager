import { getQueryParams } from './router.js'
import { showChatOverlay } from '../partials/chatOverlay.js'

let _lastHandled = null

/**
 * Watch the URL for a `chat_user` query param and open the chat overlay for
 * that user. This is how a chat is opened both from in-app chat buttons
 * (which set the param) and from push-notification deep links
 * (`#dashboard?chat_user=<id>`), so the overlay is always URL-driven.
 * @returns {void}
 */
export function initChatDeepLink () {
  const check = () => {
    const { chat_user: chatUser } = getQueryParams()
    if (chatUser) {
      if (chatUser !== _lastHandled) {
        _lastHandled = chatUser
        void showChatOverlay(Number(chatUser))
      }
    } else {
      _lastHandled = null
    }
  }
  window.addEventListener('hashchange', check)
  // Handle the initial load (e.g. a cold-start deep link already in the URL).
  check()
}
