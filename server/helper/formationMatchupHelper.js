import { FORMATION_MATCHUPS } from '../data/formationMatchups.js'

/**
 * Reading the generated formation matchup table.
 *
 * The table itself is a snapshot of the match engine (see
 * `server/data/formationMatchups.js`); everything that interprets it lives
 * here so a regeneration only ever replaces numbers.
 */

/**
 * The edge formation `a` has over formation `b`, in league points per game.
 * Unknown formations (games from before formations were stored, shapes that
 * have since been renamed) return null rather than 0, so callers can leave the
 * fact out instead of claiming a neutral matchup.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number|null}
 */
export function formationAdvantage (a, b) {
  const row = FORMATION_MATCHUPS[a]
  if (!row) return null
  const value = row[b]
  return typeof value === 'number' ? value : null
}

/**
 * The formations that beat `formation`, strongest first.
 *
 * Only genuinely favoured shapes are returned: a formation that merely loses
 * by less is not a counter, and recommending one would make the advice worse
 * than saying nothing. An even matchup therefore yields an empty list.
 *
 * @param {string} formation
 * @param {number} [limit]
 * @returns {Array<{formation: string, advantage: number}>}
 */
export function bestCountersTo (formation, limit = 3) {
  if (!FORMATION_MATCHUPS[formation]) return []
  return Object.keys(FORMATION_MATCHUPS)
    .filter(candidate => candidate !== formation)
    .map(candidate => ({ formation: candidate, advantage: formationAdvantage(candidate, formation) }))
    // Below the standard error of a single cell the "edge" is simulation
    // noise, not a shape that actually beats this one.
    .filter(entry => entry.advantage !== null && entry.advantage >= 0.06)
    .sort((x, y) => y.advantage - x.advantage)
    .slice(0, limit)
}
