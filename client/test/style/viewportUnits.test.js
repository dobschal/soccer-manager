import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const STYLE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../style')

/** Third-party bundles we do not maintain. */
const IGNORED = new Set(['bootstrap.min.css', 'font-awesome.css'])

/** Declarations that size an element by the viewport height. */
const SIZING_PROPERTY = /^\s*(min-height|max-height|height)\s*:/

/**
 * A viewport-height value. The digits are part of the pattern on purpose:
 * `\bvh\b` never matches `100vh`, because there is no word boundary between the
 * `0` and the `v` — a check written that way silently passes everything.
 */
const VH_VALUE = /\d+vh\b/
const DVH_VALUE = /\d+dvh\b/

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

describe('viewport height units (#541)', () => {
  // `100vh` is the *largest* viewport: on iOS it is taller than what is really
  // on screen, so anything sized by it hangs off the bottom edge. Every sizing
  // declaration therefore states `vh` first (the fallback for browsers without
  // `dvh`) and `dvh` immediately after. Transforms are exempt — an animation
  // that throws an element off-screen wants the larger unit.
  it('pairs every vh-sized declaration with a dvh fallback line', () => {
    const offenders = []
    for (const file of stylesheets(STYLE_DIR)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!SIZING_PROPERTY.test(line) || !VH_VALUE.test(line)) return
        const property = line.match(SIZING_PROPERTY)[1]
        const next = lines[i + 1] ?? ''
        const paired = next.includes(`${property}:`) && DVH_VALUE.test(next)
        if (!paired) {
          offenders.push(`${path.relative(STYLE_DIR, file)}:${i + 1} — ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
