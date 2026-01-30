const subs = ['North', 'South', 'East', 'West', 'North-East', 'South-East', 'North-West', 'South-West']
/**
 * @param {number} level
 * @param {number} league
 * @returns {string}
 */
export function formatLeague (level, league) {
  return `${level + 1}. ${subs[league]}`
}
