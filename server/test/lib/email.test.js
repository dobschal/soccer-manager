import { describe, expect, it } from 'vitest'
import { buildReferralSignupUrl } from '../../lib/email.js'

describe('buildReferralSignupUrl', () => {
  it('embeds the email in the hash query so the unauthenticated #login redirect cannot strip it', () => {
    const url = buildReferralSignupUrl('friend@example.com')
    // The router treats anything before `#` as the root and would discard a
    // top-level `?email=…` when redirecting an unauthenticated visitor to
    // `#login` — the email must live inside the hash.
    expect(url).toMatch(/\/#login\?/)
    expect(url).toContain('type=registration')
    expect(url).toContain('email=friend%40example.com')
  })

  it('URL-encodes special characters in the email so the hash query parses cleanly', () => {
    const url = buildReferralSignupUrl('a+b@müller.de')
    // `+` would otherwise be interpreted as a space; non-ASCII must be %-encoded.
    expect(url).toContain('email=a%2Bb%40m%C3%BCller.de')
  })
})
