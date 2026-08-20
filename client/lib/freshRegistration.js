/**
 * One-shot handoff from the team-choice wizard to the dashboard (#564).
 *
 * A brand-new manager lands on the dashboard straight out of the wizard, where
 * the match ticker (for a game the bot still played), the action-card claim
 * overlay, the season review and the email prompt all queue up in front of the
 * tutorial. The wizard raises the flag on its way out and the dashboard
 * consumes it on the first render, so the very first visit shows the tutorial
 * and nothing else — every other overlay comes back on the next visit.
 */

const FRESH_REGISTRATION_KEY = 'freshRegistration'

/**
 * Remember that the user just finished the registration wizard.
 * @returns {void}
 */
export function markFreshRegistration () {
  try {
    localStorage.setItem(FRESH_REGISTRATION_KEY, '1')
  } catch {
    // Private-mode Safari throws on write — the worst case is that the new
    // manager sees the usual overlays, so there is nothing to recover from.
  }
}

/**
 * Read *and clear* the flag. Returns true only for the first dashboard render
 * after the wizard, so a reload or a second visit behaves normally again.
 * @returns {boolean}
 */
export function consumeFreshRegistration () {
  try {
    if (!localStorage.getItem(FRESH_REGISTRATION_KEY)) return false
    localStorage.removeItem(FRESH_REGISTRATION_KEY)
    return true
  } catch {
    return false
  }
}
