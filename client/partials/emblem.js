import { generateEmblem, parseEmblemParams } from '../util/emblemGenerator.js'

/**
 * Render an emblem for a team
 * @param {Object} team - Team object with emblem params
 * @param {number} [size=200] - Size of the emblem
 * @returns {string} SVG HTML string
 */
export function renderEmblem (team, size = 200) {
  const params = parseEmblemParams(team.emblem)

  if (!params) {
    // Fallback for teams without emblem params
    return generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: team.color || '#1a5f7a',
      teamName: team.name,
      size
    })
  }

  return generateEmblem({
    shape: params.shape,
    pattern: params.pattern,
    color: params.color,
    color2: params.color2,
    wordsOnBanner: params.wordsOnBanner,
    prefix1OnBanner: params.prefix1OnBanner,
    prefix2OnBanner: params.prefix2OnBanner,
    teamName: team.name,
    size
  })
}
