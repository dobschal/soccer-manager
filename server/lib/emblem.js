export const emblemShapes = ['circle', 'oval', 'triangle', 'shield', 'shield2', 'shield3', 'crest', 'pentagon']

export const emblemPatterns = ['solid', 'stripes', 'horizontalStripes', 'quartered', 'diagonal', 'halved']

export const emblemColors = [
  '#1a5f7a', '#c41e3a', '#0047ab', '#228b22', '#6b3fa0',
  '#ff6b35', '#2c3e50', '#8b0000', '#006400', '#191970',
  '#4a0080', '#b8860b', '#008080', '#800020', '#355e3b',
  '#003366', '#8b4513', '#4b0082', '#2f4f4f', '#800080'
]

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
