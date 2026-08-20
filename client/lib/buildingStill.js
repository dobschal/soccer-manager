/**
 * Shared cache for the 3D stills of club buildings.
 *
 * A still is one frame of the club scene, cropped to a single building
 * (`StadiumCanvas#captureBuilding`). Rendering one means booting a WebGL scene,
 * so whoever pays that price puts the result in here and every other page gets
 * it for free: the buildings page fills the cache for the levels it shows, and
 * the youth-team page reads the academy's still for its squad photo (#563).
 *
 * In-memory on purpose — it lives as long as the single-page app does, which is
 * exactly how long a still stays accurate. A building upgrade changes the level,
 * and the level is part of the key.
 */

/** @type {Map<string, string>} */
const stills = new Map()

/**
 * @param {string} type building type, e.g. `youth_academy`
 * @param {number} level
 * @returns {string}
 */
function key (type, level) {
  return `${type}:${Math.max(1, Math.min(3, Math.floor(level || 1)))}`
}

/**
 * The still for this building at this level, if one has been rendered.
 * @param {string} type
 * @param {number} level
 * @returns {string|null} a JPEG data URL
 */
export function cachedBuildingStill (type, level) {
  return stills.get(key(type, level)) ?? null
}

/**
 * @param {string} type
 * @param {number} level
 * @param {string} dataUrl
 * @returns {void}
 */
export function rememberBuildingStill (type, level, dataUrl) {
  if (!dataUrl) return
  stills.set(key(type, level), dataUrl)
}

/**
 * Drop everything. Only used by tests — the app has no reason to forget a still.
 * @returns {void}
 */
export function forgetBuildingStills () {
  stills.clear()
}
