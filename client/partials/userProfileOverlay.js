import { showOverlay } from './overlay.js'
import { t } from '../i18n/index.js'
import { UserProfilePage } from '../pages/userProfile.js'

/**
 * Open a manager's profile in an overlay instead of navigating to the `#user`
 * page (#532). Everywhere in the game that used to jump away now opens this,
 * so the user keeps their place — the team page they were reading, the search
 * results they were scrolling.
 *
 * The `#user` route stays registered: push notifications and shared links have
 * to keep resolving to a real page.
 *
 * @param {number} userId
 * @returns {{onClose: (callback: () => void) => void, remove: () => void}|null}
 */
export function showUserProfileOverlay (userId) {
  const id = Number(userId)
  if (!Number.isFinite(id) || id <= 0) return null
  const page = new UserProfilePage()
  page.userId = id
  // Suppresses the page's "bail to the dashboard" error handling — inside an
  // overlay there is nothing to navigate away from.
  page.inOverlay = true
  return showOverlay(t('userProfile.title'), '', `${page}`)
}
