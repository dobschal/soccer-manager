import { describe, it, expect } from 'vitest'
import { linkifyHtml } from '../../lib/linkify.js'

describe('linkifyHtml', () => {
  it('returns an empty string for empty / nullish input', () => {
    expect(linkifyHtml('')).toBe('')
    expect(linkifyHtml(null)).toBe('')
    expect(linkifyHtml(undefined)).toBe('')
  })

  it('escapes plain text without inserting anchors', () => {
    expect(linkifyHtml('Hello <script>')).toBe('Hello &lt;script&gt;')
  })

  it('wraps an http URL in an anchor that opens in a new tab', () => {
    const html = linkifyHtml('Check http://example.com today')
    expect(html).toContain('<a href="http://example.com" target="_blank" rel="noopener noreferrer">http://example.com</a>')
    expect(html.startsWith('Check ')).toBe(true)
    expect(html.endsWith(' today')).toBe(true)
  })

  it('wraps an https URL with a query string', () => {
    const html = linkifyHtml('Site: https://example.com/path?a=1&b=2 ok')
    expect(html).toContain('href="https://example.com/path?a=1&amp;b=2"')
    expect(html).toContain('>https://example.com/path?a=1&amp;b=2</a>')
  })

  it('does not absorb trailing sentence punctuation into the link', () => {
    const html = linkifyHtml('Visit https://example.com. Thanks!')
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>')
    // The period must stay outside the anchor
    expect(html).toContain('</a>. Thanks!')
  })

  it('handles multiple links in the same string', () => {
    const html = linkifyHtml('A https://a.example B https://b.example C')
    const matches = html.match(/<a /g)
    expect(matches).not.toBeNull()
    expect(matches.length).toBe(2)
    expect(html).toContain('href="https://a.example"')
    expect(html).toContain('href="https://b.example"')
  })

  it('passes non-URL segments through the transform callback', () => {
    const html = linkifyHtml('hi\nthere see https://x.example', (escaped) => escaped.replace(/\n/g, '<br>'))
    expect(html).toContain('hi<br>there see ')
    expect(html).toContain('<a href="https://x.example"')
  })

  it('does not produce an anchor inside HTML-escaped output for plain text containing < >', () => {
    const html = linkifyHtml('1 < 2 and 3 > 0')
    expect(html).not.toContain('<a ')
    expect(html).toBe('1 &lt; 2 and 3 &gt; 0')
  })
})
