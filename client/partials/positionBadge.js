/**
 * Render a colored position badge (e.g. "GK", "LD"). Background is the
 * position-group color, text is white, shape is a square with a 4px radius.
 *
 * @param {string} position
 * @returns {string}
 */
export function renderPositionBadge (position) {
  if (!position) return ''
  return `<span class="position-badge ${position}">${position}</span>`
}
