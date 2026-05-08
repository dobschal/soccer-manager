import { describe, it, expect } from 'vitest'
import { isSandboxHost, PRODUCTION_URL } from '../../lib/environment.js'

describe('environment.isSandboxHost', () => {
  it('returns true for the sandbox host', () => {
    expect(isSandboxHost('sandbox.footballmanager.io')).toBe(true)
  })

  it('returns true case-insensitively', () => {
    expect(isSandboxHost('Sandbox.FootballManager.IO')).toBe(true)
  })

  it('returns false for the production host', () => {
    expect(isSandboxHost('footballmanager.io')).toBe(false)
  })

  it('returns false for localhost', () => {
    expect(isSandboxHost('localhost')).toBe(false)
  })

  it('returns false for arbitrary subdomains that are not sandbox.*', () => {
    expect(isSandboxHost('api.footballmanager.io')).toBe(false)
    expect(isSandboxHost('staging.footballmanager.io')).toBe(false)
  })

  it('does not match a host that merely contains "sandbox"', () => {
    expect(isSandboxHost('mysandbox.footballmanager.io')).toBe(false)
  })

  it('exposes the production URL', () => {
    expect(PRODUCTION_URL).toBe('https://footballmanager.io')
  })
})
