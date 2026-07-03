const STORAGE_KEY_PREFIX = 'action-cards-seen-'

/**
 * @param {number} teamId
 * @returns {string}
 */
function storageKey (teamId) {
  return `${STORAGE_KEY_PREFIX}${teamId}`
}

/**
 * The set of action-card ids the user has already seen in the "Aktionen" tab.
 * @param {number} teamId
 * @returns {number[]}
 */
function getSeenIds (teamId) {
  try {
    const raw = window.localStorage.getItem(storageKey(teamId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Count how many of the given action cards the user has not seen yet.
 * @param {number} teamId
 * @param {Array<{id: number}>} cards
 * @returns {number}
 */
export function countUnseenActionCards (teamId, cards) {
  const seen = new Set(getSeenIds(teamId))
  return cards.filter(card => !seen.has(card.id)).length
}

/**
 * Mark the given action cards as seen. Replaces the stored set with exactly the
 * current card ids so used/merged cards are pruned automatically.
 * @param {number} teamId
 * @param {Array<{id: number}>} cards
 */
export function markActionCardsSeen (teamId, cards) {
  try {
    window.localStorage.setItem(storageKey(teamId), JSON.stringify(cards.map(card => card.id)))
  } catch {
    /* ignore storage errors (private mode / quota) */
  }
}
