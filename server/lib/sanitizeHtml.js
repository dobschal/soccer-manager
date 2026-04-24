const ALLOWED_TAGS = new Set([
  'b', 'i', 'u', 's', 'em', 'strong', 'br', 'p', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'a', 'span', 'div', 'sub', 'sup'
])

/**
 * Sanitize HTML by stripping all tags/attributes except a whitelist.
 * Allows href on <a> tags (only http/https URLs).
 * @param {string} html
 * @returns {string}
 */
export function sanitizeHtml (html) {
  if (typeof html !== 'string') return ''

  // Remove <script>, <style>, <iframe> and their content completely
  let result = html.replace(/<(script|style|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')

  // Remove any remaining self-closing or opening dangerous tags
  result = result.replace(/<\/?(script|style|iframe|object|embed|form|input|textarea|select|button)[^>]*>/gi, '')

  // Process remaining tags: keep allowed ones, strip disallowed ones
  result = result.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*\/?>/gi, (match, tagName) => {
    const tag = tagName.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return ''

    // For closing tags, just return the clean closing tag
    if (match.startsWith('</')) return `</${tag}>`

    // For <a> tags, preserve href if it's a safe URL
    if (tag === 'a') {
      const hrefMatch = match.match(/href\s*=\s*["']([^"']*)["']/i)
      if (hrefMatch) {
        const href = hrefMatch[1]
        if (/^https?:\/\//i.test(href)) {
          return `<a href="${href}" target="_blank" rel="noopener noreferrer">`
        }
      }
      return '<a>'
    }

    // For <br>, return self-closing
    if (tag === 'br') return '<br>'

    // For all other allowed tags, strip all attributes
    return `<${tag}>`
  })

  return result
}
