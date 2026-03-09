/**
 * Shorten a team name for mobile display by hiding the middle part (prefix2).
 * E.g. "SSC Dynamic Gütersloh" → "SSC <hidden>Dynamic </hidden>Gütersloh"
 * E.g. "Olympic Ironhold" → "<hidden>Olympic </hidden>Ironhold"
 * Abbreviation-like words (FC, SSC, 1., etc.) and the city (last word) always stay visible.
 * @param {string} name
 * @returns {string} HTML string with d-none d-lg-inline spans
 */
export function shortenTeamName (name) {
  if (!name) return ''
  const words = name.split(' ')
  if (words.length <= 1) return name

  const isAbbrev = (w) => /^[A-Z.0-9]+\.?$/.test(w) || /^\d/.test(w)

  let result = ''
  for (let i = 0; i < words.length; i++) {
    const isLast = i === words.length - 1
    if (isLast || isAbbrev(words[i])) {
      result += words[i]
      if (!isLast) result += ' '
    } else {
      result += `<span class="d-none d-lg-inline">${words[i]} </span>`
    }
  }
  return result
}
