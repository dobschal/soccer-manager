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
  shield4: {
    name: 'Awesome Shield',
    path: 'M100 13C100 13 112 25 142 26C167 27 176 21 176 21C176 21 198 86 161 140C142 168 104 187 100 188C96 187 59 168 39 140C2 86 25 21 25 21C25 21 34 27 59 26C88 25 100 13 100 13Z',
    viewBox: '0 0 200 200'
  },
  shield5: {
    name: 'Curved Shield',
    path: 'M98 200C104 188 176 179 163 125C143 45 168 37 168 37L152 18C152 18 142 28 126 25C106 22 103 7 98 0C93 7 90 22 70 25C54 28 44 18 44 18L28 37C28 37 52 45 33 125C20 179 92 188 98 200Z',
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

// Colors with good contrast - full spectrum from red to purple
export const EMBLEM_COLORS = [
  // Reds
  '#ea3636',
  '#960c0c',
  // Pink
  '#dc1061',
  // Oranges
  '#f56600',
  // Yellows/Golds
  '#ffca46',
  '#c99c00',
  // Brown
  '#815d53',
  // Greens
  '#90c954',
  '#319a35',
  '#0f4b13',
  // Cyans/Teals
  '#0fc7c2',
  '#036c69',
  // Blues
  '#2c87e1',
  '#0a3b88',
  // Purples
  '#902abb',
  '#512DA8',
  // Neutrals
  '#F5E6C8',
  '#BDBDBD',
  '#8ca1ab',
  '#424242'
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shapeData.viewBox}" width="${size}" height="${size}">
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
    <!-- Left ribbon -->
    <path d="M3 175L42 175L26 168V154H3L15 165L3 175Z" fill="${adjustBrightness(color, -20)}" stroke="white" stroke-width="3"/>
    <!-- Right ribbon -->
    <path d="M197 175L159 175L175 168V153H197L186 165L197 175Z" fill="${adjustBrightness(color, -20)}" stroke="white" stroke-width="3"/>
    <!-- Left dark fold -->
    <path d="M28 168H42V173L28 168Z" fill="${adjustBrightness(color, -40)}"/>
    <!-- Right dark fold -->
    <path d="M173 167H159V173L173 167Z" fill="${adjustBrightness(color, -40)}"/>
    <!-- Main banner body -->
    <path d="M173 144H26V167H175V144Z" fill="${adjustBrightness(color, -20)}" stroke="white" stroke-width="3"/>
    <!-- Team name on banner -->
    <text x="100" y="161" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">${displayName.toUpperCase()}</text>
  </g>
</svg>`
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
