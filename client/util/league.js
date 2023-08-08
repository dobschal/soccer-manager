const subs = ['North', 'South', 'East', 'West', 'North-East', 'South-East', 'North-West', 'South-West']
export function formatLeague (level, league) {
  return `${level + 1}. ${subs[league]}`
}
