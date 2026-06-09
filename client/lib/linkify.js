/**
 * URL detection used by linkifyHtml. Matches http/https URLs up to the
 * next whitespace or angle bracket / quote. Tightened to avoid swallowing
 * trailing sentence punctuation.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"]+/g

const TRAILING_PUNCT_RE = /[.,;:!?)]+$/

/**
 * Escape user-controlled text for safe HTML insertion.
 * @param {string} text
 * @returns {string}
 */
function escape (text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Tokenize a raw string into URL segments and plain-text segments.
 * Segments preserve original order; punctuation that visually trails a
 * URL ("see https://example.com.") is split off so the link does not
 * absorb the period.
 * @param {string} text
 * @returns {Array<{type: 'url'|'text', value: string}>}
 */
function tokenize (text) {
  const out = []
  let last = 0
  let match
  URL_PATTERN.lastIndex = 0
  while ((match = URL_PATTERN.exec(text)) !== null) {
    if (match.index > last) {
      out.push({ type: 'text', value: text.slice(last, match.index) })
    }
    let url = match[0]
    let trailing = ''
    const punct = url.match(TRAILING_PUNCT_RE)
    if (punct) {
      trailing = punct[0]
      url = url.slice(0, url.length - trailing.length)
    }
    out.push({ type: 'url', value: url })
    if (trailing) out.push({ type: 'text', value: trailing })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    out.push({ type: 'text', value: text.slice(last) })
  }
  return out
}

/**
 * Convert URLs inside a raw string to anchor tags and HTML-escape the rest.
 * Optionally transforms each non-URL segment after escaping (used by the
 * forum to highlight @-mentions and turn newlines into <br>).
 *
 * Anchors always render with target="_blank" and rel="noopener noreferrer"
 * so the native WebView's existing _blank interceptor opens them in the
 * system browser instead of inside the app.
 *
 * @param {string} text
 * @param {(escaped: string) => string} [transformText]
 * @returns {string}
 */
export function linkifyHtml (text, transformText) {
  const segments = tokenize(text || '')
  return segments.map(seg => {
    if (seg.type === 'url') {
      const safe = escape(seg.value)
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`
    }
    const escaped = escape(seg.value)
    return transformText ? transformText(escaped) : escaped
  }).join('')
}
