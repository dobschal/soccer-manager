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

// Pattern definitions - each pattern uses two colors
export const EMBLEM_PATTERNS = {
  solid: {
    name: 'Solid',
    render: (color) => `
      <rect x="0" y="0" width="200" height="200" fill="${color}"/>
    `
  },
  stripes: {
    name: 'Vertical Stripes',
    render: (color, color2) => `
      <rect x="10" y="0" width="200" height="200" fill="${color}"/>
      <rect x="30" y="0" width="20" height="200" fill="${color2}"/>
      <rect x="70" y="0" width="20" height="200" fill="${color2}"/>
      <rect x="110" y="0" width="20" height="200" fill="${color2}"/>
      <rect x="150" y="0" width="20" height="200" fill="${color2}"/>
    `
  },
  horizontalStripes: {
    name: 'Horizontal Stripes',
    render: (color, color2) => `
      <rect x="0" y="0" width="200" height="200" fill="${color}"/>
      <rect x="0" y="40" width="200" height="20" fill="${color2}"/>
      <rect x="0" y="80" width="200" height="20" fill="${color2}"/>
      <rect x="0" y="120" width="200" height="20" fill="${color2}"/>
      <rect x="0" y="160" width="200" height="20" fill="${color2}"/>
    `
  },
  quartered: {
    name: 'Quartered',
    render: (color, color2) => `
      <rect x="0" y="0" width="100" height="100" fill="${color}"/>
      <rect x="100" y="0" width="100" height="100" fill="${color2}"/>
      <rect x="0" y="100" width="100" height="100" fill="${color2}"/>
      <rect x="100" y="100" width="100" height="100" fill="${color}"/>
    `
  },
  diagonal: {
    name: 'Diagonal',
    render: (color, color2) => `
      <rect x="0" y="0" width="200" height="200" fill="${color}"/>
      <polygon points="0,0 200,0 0,200" fill="${color2}"/>
    `
  },
  halved: {
    name: 'Halved',
    render: (color, color2) => `
      <rect x="0" y="0" width="100" height="200" fill="${color}"/>
      <rect x="100" y="0" width="100" height="200" fill="${color2}"/>
    `
  }
}

/**
 * Filenames (without `.svg`) of the icons in `client/assets/emblem-icons/`.
 * Listed explicitly so the bundle stays in sync with the assets directory
 * and so the editor can render a fixed picker — adding a new icon means
 * appending to this list.
 */
export const EMBLEM_ICONS = [
  'bear-svgrepo-com',
  'buffalo-svgrepo-com',
  'buffalo-2-svgrepo-com',
  'cobra-1-svgrepo-com',
  'coconut-tree-illustration-that-can-be-used-for-svgrepo-com',
  'conch-2-svgrepo-com',
  'couple-heart-like-svgrepo-com',
  'deer-illustration-1-svgrepo-com',
  'dragon-head-evil-legend-myth-svgrepo-com',
  'eagle-svgrepo-com',
  'flower-6-svgrepo-com',
  'flying-dragon-fly-legend-myth-svgrepo-com',
  'football-svgrepo-com',
  'football-svgrepo-com-2',
  'football-ball-soccer-svgrepo-com',
  'football-gym-shoes-svgrepo-com',
  'four-leaf-clover-illustration-svgrepo-com',
  'fox-2-svgrepo-com',
  'free-illustrations-of-monkeys-svgrepo-com',
  'hawk-and-eagle-svgrepo-com',
  'icon-of-a-dove-holding-an-olive-svgrepo-com',
  'lantern-anglerfish-svgrepo-com',
  'lion-2-svgrepo-com',
  'lion-wild-animal-cat-svgrepo-com',
  'merlion-3-svgrepo-com',
  'octopus-animal-cephalopod-svgrepo-com',
  'rampage-bull-svgrepo-com',
  'swallow-svgrepo-com',
  'tiger-svgrepo-com',
  'walking-dragon-legend-myth-folklore-svgrepo-com',
  'werewolf-2-svgrepo-com',
  'werewolf-5-svgrepo-com',
  'whale-tail-fin-svgrepo-com',
  'wolf-svgrepo-com'
]

/** Roles that can be assigned to the shape stroke and the optional icon. */
export const EMBLEM_TINT_OPTIONS = ['white', 'color1', 'color2']

/**
 * Resolve a saved tint role ('white' | 'color1' | 'color2') to an actual
 * color value, falling back to white for unknown values.
 * @param {string} role
 * @param {string} color1
 * @param {string} color2
 * @returns {string}
 */
export function resolveTint (role, color1, color2) {
  if (role === 'color1') return color1
  if (role === 'color2') return color2 || color1
  return '#ffffff'
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
  '#ffffff',
  '#F5E6C8',
  '#BDBDBD',
  '#8ca1ab',
  '#424242'
]

/**
 * Convert a `#rrggbb` color to floats in 0..1, used by the icon tint filter.
 * Falls back to white for unparseable input.
 * @param {string} hex
 * @returns {{r: number, g: number, b: number}}
 */
function _hexToUnit (hex) {
  const value = (hex || '').replace('#', '')
  if (value.length !== 6) return { r: 1, g: 1, b: 1 }
  const num = parseInt(value, 16)
  if (Number.isNaN(num)) return { r: 1, g: 1, b: 1 }
  return {
    r: ((num >> 16) & 0xff) / 255,
    g: ((num >> 8) & 0xff) / 255,
    b: (num & 0xff) / 255
  }
}

/**
 * Adjust color brightness
 * @param {string} hex
 * @param {number} percent
 * @returns {string}
 */
export function adjustBrightness (hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = Math.max(0, Math.min(255, (num >> 16) + amt))
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt))
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt))
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)
}

/**
 * Split a team name into its individual words.
 * @param {string} teamName
 * @returns {Array<string>}
 */
export function splitTeamNameWords (teamName) {
  if (!teamName) return []
  const cleaned = String(teamName).trim().replace(/\s+/g, ' ')
  if (!cleaned) return []
  return cleaned.split(' ')
}

/**
 * Resolve which words of a team name should appear on the emblem banner.
 * - `wordsOnBanner` (new format): array of booleans, one per word.
 * - Legacy fallback: `prefix1OnBanner` / `prefix2OnBanner` toggled the first
 *   two words, with the last word (city) always visible.
 * - Default when nothing is stored: every word visible.
 * @param {Array<string>} words
 * @param {Object} [params]
 * @returns {Array<boolean>}
 */
export function resolveWordsOnBanner (words, params = {}) {
  if (Array.isArray(params.wordsOnBanner)) {
    return words.map((_, i) => params.wordsOnBanner[i] !== false)
  }
  const hasLegacyFlags = params.prefix1OnBanner !== undefined || params.prefix2OnBanner !== undefined
  if (hasLegacyFlags) {
    return words.map((_, i) => {
      if (i === words.length - 1) return true
      if (i === 0) return !!params.prefix1OnBanner
      if (i === words.length - 2) return !!params.prefix2OnBanner
      return false
    })
  }
  return words.map(() => true)
}

/**
 * Generate an emblem SVG
 * @param {Object} options
 * @param {string} options.shape - Shape key from EMBLEM_SHAPES
 * @param {string} options.pattern - Pattern key from EMBLEM_PATTERNS
 * @param {string} options.color - Primary hex color
 * @param {string} [options.color2] - Secondary hex color for pattern
 * @param {string} options.teamName - Team name to display
 * @param {Array<boolean>} [options.wordsOnBanner] - Per-word visibility on the banner (one entry per word in teamName). When absent, every word is shown.
 * @param {boolean} [options.prefix1OnBanner] - Legacy: include the first word on the banner (last word stays on).
 * @param {boolean} [options.prefix2OnBanner] - Legacy: include the second-to-last word on the banner.
 * @param {string} [options.strokeColor] - Tint role for the shape outline ('white' | 'color1' | 'color2'). Default 'white'.
 * @param {string} [options.icon] - Filename (without `.svg`) from EMBLEM_ICONS to overlay on the shape, or null/undefined for no icon.
 * @param {string} [options.iconColor] - Tint role applied to the icon ('white' | 'color1' | 'color2'). Default 'white'.
 * @param {number} [options.size=200] - Size of the emblem
 * @returns {string} SVG string
 */
export function generateEmblem ({
  shape,
  pattern,
  color,
  color2,
  teamName,
  wordsOnBanner,
  prefix1OnBanner,
  prefix2OnBanner,
  strokeColor,
  icon,
  iconColor,
  size = 200
}) {
  const shapeData = EMBLEM_SHAPES[shape] || EMBLEM_SHAPES.shield
  const patternData = EMBLEM_PATTERNS[pattern] || EMBLEM_PATTERNS.stripes

  const words = splitTeamNameWords(teamName)
  const visibility = resolveWordsOnBanner(words, { wordsOnBanner, prefix1OnBanner, prefix2OnBanner })
  const bannerText = words.filter((_, i) => visibility[i]).join(' ').toUpperCase()
  // Banner body is ~149px wide; shrink font when the text gets long.
  const bannerFontSize = bannerText.length > 14
    ? Math.max(9, Math.floor((16 * 14) / bannerText.length))
    : 16

  // Create unique IDs for this emblem
  const uniq = Math.random().toString(36).substr(2, 9)
  const clipId = `clip-${uniq}`
  const iconFilterId = `icon-tint-${uniq}`

  const shapeStroke = resolveTint(strokeColor, color, color2 || color)
  // Banner stroke stays white regardless of strokeColor — only the outer
  // shape outline reacts to the new setting, per the editor design.
  const bannerStroke = '#ffffff'

  const iconFill = icon && EMBLEM_ICONS.includes(icon)
    ? resolveTint(iconColor, color, color2 || color)
    : null
  const iconHref = iconFill ? `./assets/emblem-icons/${icon}.svg` : null

  const iconLayer = iconHref
    ? (() => {
      const { r, g, b } = _hexToUnit(iconFill)
      return `
  <defs>
    <filter id="${iconFilterId}" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0"/>
    </filter>
  </defs>
  <image href="${iconHref}" x="60" y="55" width="80" height="80" preserveAspectRatio="xMidYMid meet" filter="url(#${iconFilterId})"/>
`
    })()
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shapeData.viewBox}" width="${size}" height="${size}">
  <defs>
    <clipPath id="${clipId}">
      <path d="${shapeData.path}"/>
    </clipPath>
  </defs>

  <!-- Background pattern clipped to shape -->
  <g clip-path="url(#${clipId})">
    ${patternData.render(color, color2 || color)}
  </g>

  ${iconLayer}

  <!-- Shape border -->
  <path d="${shapeData.path}" fill="none" stroke="${shapeStroke}" stroke-width="4"/>

  <!-- Banner -->
  <g>
    <!-- Left ribbon -->
    <path d="M3 175L42 175L26 168V154H3L15 165L3 175Z" fill="${adjustBrightness(color, -20)}" stroke="${bannerStroke}" stroke-width="3"/>
    <!-- Right ribbon -->
    <path d="M197 175L159 175L175 168V153H197L186 165L197 175Z" fill="${adjustBrightness(color, -20)}" stroke="${bannerStroke}" stroke-width="3"/>
    <!-- Left dark fold -->
    <path d="M28 168H42V173L28 168Z" fill="${adjustBrightness(color, -40)}"/>
    <!-- Right dark fold -->
    <path d="M173 167H159V173L173 167Z" fill="${adjustBrightness(color, -40)}"/>
    <!-- Main banner body -->
    <path d="M173 144H26V167H175V144Z" fill="${adjustBrightness(color, -20)}" stroke="${bannerStroke}" stroke-width="3"/>
    <!-- Team name on banner -->
    <text x="100" y="161" font-family="Arial, sans-serif" font-size="${bannerFontSize}" font-weight="bold" fill="white" text-anchor="middle">${bannerText}</text>
  </g>
</svg>`
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
