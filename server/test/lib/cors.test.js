import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { ALLOWED_HEADERS, corsMiddleware, isAllowedOrigin } from '../../lib/cors.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Minimal express req/res doubles: enough to record the headers the middleware
 * sets and whether it answered the request itself.
 */
function run (req) {
  const headers = {}
  const res = {
    setHeader: (name, value) => { headers[name] = value },
    status: vi.fn(() => res),
    end: vi.fn()
  }
  const next = vi.fn()
  corsMiddleware({ method: 'POST', headers: {}, ...req }, res, next)
  return { headers, res, next }
}

/** @param {Record<string,string>} headers */
function allowedHeaderList (headers) {
  return (headers['Access-Control-Allow-Headers'] ?? '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean)
}

describe('isAllowedOrigin', () => {
  it('allows the native app, which sends no origin at all', () => {
    expect(isAllowedOrigin(undefined)).toBe(true)
    expect(isAllowedOrigin('null')).toBe(true)
    expect(isAllowedOrigin('file://')).toBe(true)
  })

  it('allows the desktop/native app custom scheme', () => {
    expect(isAllowedOrigin('app://localhost')).toBe(true)
  })

  it('allows localhost dev servers on any port', () => {
    expect(isAllowedOrigin('http://localhost')).toBe(true)
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true)
    expect(isAllowedOrigin('https://localhost:5173')).toBe(true)
  })

  it('rejects arbitrary sites', () => {
    expect(isAllowedOrigin('https://evil.example')).toBe(false)
    expect(isAllowedOrigin('https://localhost.evil.example')).toBe(false)
  })
})

describe('corsMiddleware', () => {
  it('answers a preflight with 204 without hitting the route', () => {
    const { res, next } = run({ method: 'OPTIONS', headers: { origin: 'app://localhost' } })
    expect(res.status).toHaveBeenCalledWith(204)
    expect(res.end).toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('passes normal requests through to the route', () => {
    const { next } = run({ headers: { origin: 'app://localhost' } })
    expect(next).toHaveBeenCalled()
  })

  it('sets no CORS headers for a disallowed origin', () => {
    const { headers } = run({ headers: { origin: 'https://evil.example' } })
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(headers['Access-Control-Allow-Headers']).toBeUndefined()
  })

  it('echoes the allowed origin and falls back to * when there is none', () => {
    expect(run({ headers: { origin: 'app://localhost' } }).headers['Access-Control-Allow-Origin'])
      .toBe('app://localhost')
    expect(run({ headers: {} }).headers['Access-Control-Allow-Origin']).toBe('*')
  })

  // Regression: the gateway started sending X-Client-Id on every request while
  // this list still named only three headers. The web app is same-origin and
  // never preflights, so it kept working — but the WebView blocked every native
  // request before it left the device and the app showed "no internet
  // connection" against a perfectly healthy server.
  it('allows X-Client-Id on a preflight', () => {
    const { headers } = run({ method: 'OPTIONS', headers: { origin: 'app://localhost' } })
    expect(allowedHeaderList(headers)).toContain('x-client-id')
  })

  it('advertises every header in ALLOWED_HEADERS', () => {
    const { headers } = run({ headers: { origin: 'app://localhost' } })
    const advertised = allowedHeaderList(headers)
    for (const header of ALLOWED_HEADERS) {
      expect(advertised).toContain(header.toLowerCase())
    }
  })
})

describe('ALLOWED_HEADERS vs. the gateway', () => {
  /**
   * Reads back the header names `client/lib/gateway.js` actually sets, so this
   * fails the next time a header is added on the client without being allowed
   * here — the exact drift that broke the native app.
   */
  function headersSentByGateway () {
    const source = readFileSync(resolve(here, '../../../client/lib/gateway.js'), 'utf-8')
    const names = new Set()
    // `options.headers['X-Client-Id'] = …`
    for (const [, name] of source.matchAll(/headers\[['"]([\w-]+)['"]\]\s*=/g)) names.add(name)
    // `options.headers.Authorization = …`
    for (const [, name] of source.matchAll(/headers\.([\w-]+)\s*=/g)) names.add(name)
    // the `headers: { 'Content-Type': …, 'Accept-Language': … }` literal
    const literal = source.match(/headers:\s*\{([\s\S]*?)\n\s*\}/)
    if (literal) {
      for (const [, name] of literal[1].matchAll(/['"]([\w-]+)['"]\s*:/g)) names.add(name)
    }
    return [...names]
  }

  it('finds the headers the gateway sets', () => {
    // Guards the regexes above: if the gateway is rewritten in a shape they no
    // longer match, this test fails instead of silently passing on an empty set.
    expect(headersSentByGateway().length).toBeGreaterThanOrEqual(4)
  })

  it('allows every header the gateway sends', () => {
    const allowed = ALLOWED_HEADERS.map(h => h.toLowerCase())
    for (const header of headersSentByGateway()) {
      expect(allowed).toContain(header.toLowerCase())
    }
  })
})
