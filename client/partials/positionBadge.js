/**
 * Render a colored position badge (e.g. "GK", "LD"). Background is the
 * position-group color, text is white, shape is a square with a 4px radius.
 * When `outOfPosition` is true, the badge is highlighted with a red ring to
 * flag a player being fielded outside their natural position.
 *
 * @param {string} position
 * @param {{ outOfPosition?: boolean }} [options]
 * @returns {string}
 */
export function renderPositionBadge (position, options = {}) {
  if (!position) return ''
  const cls = `position-badge ${position}${options.outOfPosition ? ' is-wrong-position' : ''}`
  return `<span class="${cls}">${position}</span>`
}
