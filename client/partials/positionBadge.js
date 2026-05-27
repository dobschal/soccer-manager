/**
 * Render a colored position badge (e.g. "GK", "LD"). Background is the
 * position-group color, text is white, shape is a square with a 4px radius.
 * When `outOfPosition` is true, the badge is highlighted with a red ring to
 * flag a player being fielded outside their natural position. When `dimmed`
 * is true, the badge renders at 50% opacity — used as a secondary hint next
 * to the primary badge.
 *
 * @param {string} position
 * @param {{ outOfPosition?: boolean, dimmed?: boolean }} [options]
 * @returns {string}
 */
export function renderPositionBadge (position, options = {}) {
  if (!position) return ''
  const modifiers = [
    options.outOfPosition ? 'is-wrong-position' : '',
    options.dimmed ? 'is-dimmed' : ''
  ].filter(Boolean).join(' ')
  const cls = `position-badge ${position}${modifiers ? ' ' + modifiers : ''}`
  return `<span class="${cls}">${position}</span>`
}
