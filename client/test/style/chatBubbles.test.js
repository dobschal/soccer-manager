import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const STYLE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../style')

/** Third-party bundles we do not maintain. */
const IGNORED = new Set(['bootstrap.min.css', 'font-awesome.css'])

/**
 * @param {string} dir
 * @returns {string[]} every stylesheet below `dir`, recursively
 */
function stylesheets (dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return stylesheets(full)
    if (!entry.name.endsWith('.css') || IGNORED.has(entry.name)) return []
    return [full]
  })
}

/**
 * @param {string} relative - path below `client/style`
 * @returns {string}
 */
function css (relative) {
  return fs.readFileSync(path.join(STYLE_DIR, relative), 'utf8')
}

describe('chat bubbles', () => {
  it('gives own messages the subtle info background', () => {
    expect(css('components/chat.css')).toMatch(
      /\.chat-message--mine \.chat-bubble \{[^}]*--bs-info-bg-subtle/
    )
  })

  it('gives both bubble variants a tail in the bubble colour', () => {
    const chat = css('components/chat.css')
    // `background: inherit` on the pseudo-element takes the bubble's own
    // colour, so the tail cannot drift away from it.
    expect(chat).toMatch(/\.chat-bubble::after \{[^}]*background: inherit/)
    expect(chat).toMatch(/\.chat-message--mine \.chat-bubble::after \{[^}]*right:/)
    expect(chat).toMatch(/\.chat-message--theirs \.chat-bubble::after \{[^}]*left:/)
  })

  // A stale `.chat-bubble { margin-top: -10px }` in manager-chat.css — left
  // over from before the manager bubble was renamed to `.manager-chat-bubble`
  // — ate the flex gap between bubbles below 768px while desktop looked fine.
  it('is styled only by chat.css, so no media query can eat the gap', () => {
    const offenders = stylesheets(STYLE_DIR)
      .filter(file => path.basename(file) !== 'chat.css')
      .filter(file => /(^|[\s,])\.chat-bubble\b/m.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(STYLE_DIR, file))
    expect(offenders).toEqual([])
  })
})

describe('native chat overlay', () => {
  // The sheet fills its backdrop, so the backdrop's padding is what keeps the
  // top bar and the bottom tab bar uncovered. Without the bottom padding the
  // sheet ran roughly a tab bar's height past the bottom edge.
  it('keeps the tab bar uncovered', () => {
    const native = css('native-app.css')
    const rule = native.match(
      /\.native-app-layout ~ \.overlay-backdrop\.chat-overlay-backdrop \{([^}]*)\}/
    )
    expect(rule).not.toBeNull()
    expect(rule[1]).toMatch(/padding-top:\s*3\.5rem/)
    expect(rule[1]).toMatch(/padding-bottom:\s*4\.5rem/)
  })
})
