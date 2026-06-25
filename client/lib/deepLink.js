import { goTo } from './router.js'

/**
 * Navigate the web app to the hash/query carried by a tapped push
 * notification (#330). Accepts values like "#club?sub_page=buildings",
 * "club?sub_page=buildings" or "/#club". Invalid/empty values are ignored.
 * @param {string} hash
 * @returns {boolean} whether navigation was triggered
 */
export function handleDeepLink (hash) {
  if (typeof hash !== 'string') return false
  // Normalise: drop a leading slash and the leading '#', collapse whitespace.
  const path = hash.trim().replace(/^\/?#?/, '')
  if (!path) return false
  goTo(path)
  return true
}
