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

describe('chat message field', () => {
  // `rows` cannot be animated and a scrollHeight-based autogrow guesses at the
  // content, so the two heights are spelled out from Bootstrap's form-control
  // box: line-height 1.5 + 0.375rem padding top and bottom + 1px border each
  // side. One line at rest, exactly three lines while focused.
  it('is one line tall at rest', () => {
    const rule = css('components/chat.css').match(/\.chat-text-input \{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule[1]).toMatch(/line-height:\s*1\.5/)
    expect(rule[1]).toMatch(/height:\s*calc\(1\.5em \+ 0\.75rem \+ 2px\)/)
  })

  it('grows to exactly three lines while it has focus', () => {
    const rule = css('components/chat.css').match(
      /\.chat-input-row--typing \.chat-text-input \{([^}]*)\}/
    )
    expect(rule).not.toBeNull()
    // 4.5em = 3 x line-height 1.5.
    expect(rule[1]).toMatch(/height:\s*calc\(4\.5em \+ 0\.75rem \+ 2px\)/)
  })

  it('animates between the two heights instead of jumping', () => {
    expect(css('components/chat.css')).toMatch(/\.chat-text-input \{[^}]*transition:[^}]*height/)
  })

  it('does not cap the field with a max-height that would clip the third line', () => {
    const rule = css('components/chat.css').match(/\.chat-text-input \{([^}]*)\}/)
    expect(rule[1]).not.toMatch(/max-height/)
  })
})

describe('chat conversation selector in the card header', () => {
  it('lets the header slot shrink so the row cannot wrap', () => {
    const rule = css('components/overlay.css').match(/\.overlay-header__slot \{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule[1]).toMatch(/min-width:\s*0/)
    expect(rule[1]).toMatch(/flex:\s*1 1 auto/)
  })

  it('keeps the selector itself on one line', () => {
    const rule = css('components/chat.css').match(/\.chat-conversation-select \{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule[1]).toMatch(/white-space:\s*nowrap/)
    expect(rule[1]).toMatch(/text-overflow:\s*ellipsis/)
  })

  it('never shrinks the "Chat" title to make room', () => {
    expect(css('components/chat.css')).toMatch(
      /\.chat-overlay-card \.overlay-header__title \{[^}]*flex:\s*0 0 auto/
    )
  })
})
