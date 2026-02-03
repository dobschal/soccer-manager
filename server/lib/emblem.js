import {
  EMBLEM_COLORS,
  EMBLEM_PATTERNS,
  EMBLEM_SHAPES
} from '../../client/util/emblemGenerator.js'

// Re-export with original naming convention for backward compatibility
export const emblemShapes = Object.keys(EMBLEM_SHAPES)
export const emblemPatterns = Object.keys(EMBLEM_PATTERNS)
export const emblemColors = EMBLEM_COLORS

/**
 * Generates a random emblem configuration
 * @returns {{ shape: string, pattern: string, color: string }}
 */
export function generateRandomEmblem () {
  const shape = emblemShapes[Math.floor(Math.random() * emblemShapes.length)]
  const pattern = emblemPatterns[Math.floor(Math.random() * emblemPatterns.length)]
  const color = emblemColors[Math.floor(Math.random() * emblemColors.length)]
  return { shape, pattern, color }
}
