export const FORUM_BADGE_COLORS = [
  { hex: '#0d6efd', key: 'forum.color.blue' },
  { hex: '#28a745', key: 'forum.color.green' },
  { hex: '#ffc107', key: 'forum.color.yellow' },
  { hex: '#fd7e14', key: 'forum.color.orange' },
  { hex: '#dc3545', key: 'forum.color.red' },
  { hex: '#6f42c1', key: 'forum.color.purple' },
  { hex: '#6c757d', key: 'forum.color.grey' },
  { hex: '#212529', key: 'forum.color.black' },
  { hex: '#20c997', key: 'forum.color.turquoise' }
]

export const FORUM_BADGE_COLOR_HEXES = FORUM_BADGE_COLORS.map(c => c.hex)

export function isAllowedBadgeColor (hex) {
  if (typeof hex !== 'string') return false
  return FORUM_BADGE_COLOR_HEXES.includes(hex.toLowerCase())
}
