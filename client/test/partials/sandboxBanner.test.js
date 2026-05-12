import { describe, it, expect, beforeEach } from 'vitest'
import { showSandboxBanner, applyNoIndexOnSandbox } from '../../partials/sandboxBanner.js'

function setHostname (hostname) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hostname, hash: '', href: `https://${hostname}/` },
    writable: true
  })
}

describe('showSandboxBanner', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('does nothing on the production host', () => {
    setHostname('footballmanager.io')
    showSandboxBanner()
    expect(document.querySelector('#sandbox-banner')).toBeNull()
  })

  it('does nothing on localhost', () => {
    setHostname('localhost')
    showSandboxBanner()
    expect(document.querySelector('#sandbox-banner')).toBeNull()
  })

  it('renders a banner with a link to production on the sandbox host', () => {
    setHostname('sandbox.footballmanager.io')
    showSandboxBanner()
    const banner = document.querySelector('#sandbox-banner')
    expect(banner).not.toBeNull()
    const link = banner.querySelector('a.sandbox-banner-link')
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe('https://footballmanager.io')
  })

  it('is idempotent and does not insert the banner twice', () => {
    setHostname('sandbox.footballmanager.io')
    showSandboxBanner()
    showSandboxBanner()
    expect(document.querySelectorAll('#sandbox-banner').length).toBe(1)
  })

  it('re-inserts the banner after the body is replaced (router layout swap)', () => {
    setHostname('sandbox.footballmanager.io')
    showSandboxBanner()
    expect(document.querySelector('#sandbox-banner')).not.toBeNull()
    // Simulate the router wiping the body when switching layouts.
    document.body.innerHTML = '<div class="game-layout"></div>'
    expect(document.querySelector('#sandbox-banner')).toBeNull()
    showSandboxBanner()
    expect(document.querySelector('#sandbox-banner')).not.toBeNull()
  })
})

describe('applyNoIndexOnSandbox', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = `
      <meta name="robots" content="index, follow">
      <meta name="googlebot" content="index, follow">
      <link rel="canonical" href="https://footballmanager.io/">
    `
  })

  it('keeps SEO meta tags intact on the production host', () => {
    setHostname('footballmanager.io')
    applyNoIndexOnSandbox()
    expect(document.querySelector('meta[name="robots"]').getAttribute('content')).toBe('index, follow')
    expect(document.querySelector('meta[name="googlebot"]').getAttribute('content')).toBe('index, follow')
    expect(document.querySelector('link[rel="canonical"]')).not.toBeNull()
  })

  it('rewrites robots/googlebot to noindex and removes the canonical link on sandbox', () => {
    setHostname('sandbox.footballmanager.io')
    applyNoIndexOnSandbox()
    expect(document.querySelector('meta[name="robots"]').getAttribute('content')).toBe('noindex, nofollow')
    expect(document.querySelector('meta[name="googlebot"]').getAttribute('content')).toBe('noindex, nofollow')
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()
  })
})
