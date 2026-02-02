/**
 * Emblem Generator - Creates SVG emblems for teams
 */

// Shape definitions (path data for different emblem shapes)
export const EMBLEM_SHAPES = {
  circle: {
    name: 'Circle',
    path: 'M100,10 A90,90 0 1,1 99.9,10 Z',
    viewBox: '0 0 200 200'
  },
  oval: {
    name: 'Oval',
    path: 'M100,5 A70,95 0 1,1 99.9,5 Z',
    viewBox: '0 0 200 200'
  },
  triangle: {
    name: 'Triangle',
    path: 'M100,190 L190,20 L10,20 Z',
    viewBox: '0 0 200 200'
  },
  shield: {
    name: 'Shield',
    path: 'M100,10 L180,40 L180,100 Q180,160 100,190 Q20,160 20,100 L20,40 Z',
    viewBox: '0 0 200 200'
  },
  shield2: {
    name: 'Classic Shield',
    path: 'M100,10 L175,30 L175,90 C175,140 140,170 100,190 C60,170 25,140 25,90 L25,30 Z',
    viewBox: '0 0 200 200'
  },
  shield3: {
    name: 'Gothic Shield',
    path: 'M100,10 L170,50 L170,110 L100,190 L30,110 L30,50 Z',
    viewBox: '0 0 200 200'
  },
  crest: {
    name: 'Crest',
    path: 'M100,10 C140,10 170,30 175,60 L175,120 C175,160 140,185 100,190 C60,185 25,160 25,120 L25,60 C30,30 60,10 100,10 Z',
    viewBox: '0 0 200 200'
  },
  pentagon: {
    name: 'Pentagon',
    path: 'M100,10 L185,70 L155,180 L45,180 L15,70 Z',
    viewBox: '0 0 200 200'
  }
}

// Pattern definitions
export const EMBLEM_PATTERNS = {
  solid: {
    name: 'Solid',
    render: (color) => `<rect x="0" y="0" width="200" height="200" fill="${color}"/>`
  },
  stripes: {
    name: 'Vertical Stripes',
    render: (color) => `
      <rect x="0" y="0" width="200" height="200" fill="${color}"/>
      <rect x="40" y="0" width="20" height="200" fill="rgba(255,255,255,0.3)"/>
      <rect x="90" y="0" width="20" height="200" fill="rgba(255,255,255,0.3)"/>
      <rect x="140" y="0" width="20" height="200" fill="rgba(255,255,255,0.3)"/>
    `
  },
  horizontalStripes: {
    name: 'Horizontal Stripes',
    render: (color) => `
      <rect x="0" y="0" width="200" height="200" fill="${color}"/>
      <rect x="0" y="40" width="200" height="20" fill="rgba(255,255,255,0.3)"/>
      <rect x="0" y="90" width="200" height="20" fill="rgba(255,255,255,0.3)"/>
      <rect x="0" y="140" width="200" height="20" fill="rgba(255,255,255,0.3)"/>
    `
  },
  quartered: {
    name: 'Quartered',
    render: (color) => `
      <rect x="0" y="0" width="100" height="100" fill="${color}"/>
      <rect x="100" y="0" width="100" height="100" fill="${adjustBrightness(color, -30)}"/>
      <rect x="0" y="100" width="100" height="100" fill="${adjustBrightness(color, -30)}"/>
      <rect x="100" y="100" width="100" height="100" fill="${color}"/>
    `
  },
  diagonal: {
    name: 'Diagonal',
    render: (color) => `
      <rect x="0" y="0" width="200" height="200" fill="${color}"/>
      <polygon points="0,0 200,0 0,200" fill="${adjustBrightness(color, -30)}"/>
    `
  },
  halved: {
    name: 'Halved',
    render: (color) => `
      <rect x="0" y="0" width="100" height="200" fill="${color}"/>
      <rect x="100" y="0" width="100" height="200" fill="${adjustBrightness(color, -30)}"/>
    `
  }
}

// 20 colors with good contrast against white
export const EMBLEM_COLORS = [
  '#c41e3a', // Cardinal Red
  '#8b0000', // Dark Red
  '#8b4513', // Saddle Brown
  '#ff6b35', // Vibrant Orange
  '#b8860b', // Dark Goldenrod
  '#228b22', // Forest Green
  '#355e3b', // Hunter Green
  '#006400', // Dark Green
  '#008080', // Teal
  '#1a5f7a', // Deep Teal
  '#2f4f4f', // Dark Slate Gray
  '#003366', // Navy Blue
  '#0047ab', // Cobalt Blue
  '#191970', // Midnight Blue
  '#4a0080', // Deep Purple
  '#6b3fa0', // Royal Purple
  '#800080'  // Purple
]

/**
 * Adjust color brightness
 * @param {string} hex
 * @param {number} percent
 * @returns {string}
 */
function adjustBrightness (hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = Math.max(0, Math.min(255, (num >> 16) + amt))
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt))
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt))
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)
}

/**
 * Generate an emblem SVG
 * @param {Object} options
 * @param {string} options.shape - Shape key from EMBLEM_SHAPES
 * @param {string} options.pattern - Pattern key from EMBLEM_PATTERNS
 * @param {string} options.color - Hex color
 * @param {string} options.teamName - Team name to display
 * @param {number} [options.size=200] - Size of the emblem
 * @returns {string} SVG string
 */
export function generateEmblem ({
  shape,
  pattern,
  color,
  teamName,
  size = 200
}) {
  const shapeData = EMBLEM_SHAPES[shape] || EMBLEM_SHAPES.shield
  const patternData = EMBLEM_PATTERNS[pattern] || EMBLEM_PATTERNS.solid

  // Get display name (last word of team name)
  const nameParts = teamName.split(' ')
  const displayName = nameParts[nameParts.length - 1]

  // Create unique IDs for this emblem
  const clipId = `clip-${Math.random().toString(36).substr(2, 9)}`
  const patternId = `pattern-${Math.random().toString(36).substr(2, 9)}`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shapeData.viewBox}" width="${size}" height="${size}">
  <defs>
    <clipPath id="${clipId}">
      <path d="${shapeData.path}"/>
    </clipPath>
  </defs>

  <!-- Background pattern clipped to shape -->
  <g clip-path="url(#${clipId})">
    ${patternData.render(color)}
  </g>

  <!-- Shape border -->
  <path d="${shapeData.path}" fill="none" stroke="white" stroke-width="4"/>

  <!-- Banner -->
  <g>
    <!-- Left ribbon fold (behind) -->
    <path d="M25,152 L5,152 L12,165 L5,178 L25,178 L30,165 Z" fill="${adjustBrightness(color, -20)}" stroke="white" stroke-width="1.5"/>
    <!-- Right ribbon fold (behind) -->
    <path d="M175,152 L195,152 L188,165 L195,178 L175,178 L170,165 Z" fill="${adjustBrightness(color, -20)}" stroke="white" stroke-width="1.5"/>
    <!-- Main banner ribbon -->
    <path d="M25,150 L175,150 L175,180 L25,180 Z" fill="${color}" stroke="white" stroke-width="2"/>
    <!-- Banner curve effect (top) -->
    <path d="M25,150 Q100,145 175,150" fill="none" stroke="white" stroke-width="2"/>
    <!-- Banner curve effect (bottom) -->
    <path d="M25,180 Q100,185 175,180" fill="none" stroke="white" stroke-width="2"/>
    <!-- Team name on banner -->
    <text x="100" y="170" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">${displayName.toUpperCase()}</text>
  </g>
</svg>`

  return svg
}

/**
 * Generate emblem parameters object for storage
 * @param {string} shape
 * @param {string} pattern
 * @param {string} color
 * @returns {Object}
 */
export function createEmblemParams (shape, pattern, color) {
  return {
    shape,
    pattern,
    color
  }
}

/**
 * Parse emblem params from JSON string
 * @param {string} json
 * @returns {Object|null}
 */
export function parseEmblemParams (json) {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Get a random emblem configuration
 * @returns {Object}
 */
export function getRandomEmblemParams () {
  const shapes = Object.keys(EMBLEM_SHAPES)
  const patterns = Object.keys(EMBLEM_PATTERNS)
  const colors = EMBLEM_COLORS

  return {
    shape: shapes[Math.floor(Math.random() * shapes.length)],
    pattern: patterns[Math.floor(Math.random() * patterns.length)],
    color: colors[Math.floor(Math.random() * colors.length)]
  }
}
