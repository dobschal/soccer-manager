import { describe, it, expect } from 'vitest'
import { isSandboxHost } from '../../lib/sandboxHost.js'

describe('isSandboxHost', () => {
  it('matches the sandbox host', () => {
    expect(isSandboxHost('sandbox.footballmanager.io')).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(isSandboxHost('Sandbox.FootballManager.IO')).toBe(true)
  })

  it('does not match the production host', () => {
    expect(isSandboxHost('footballmanager.io')).toBe(false)
  })

  it('does not match localhost', () => {
    expect(isSandboxHost('localhost')).toBe(false)
  })

  it('does not match other subdomains', () => {
    expect(isSandboxHost('api.footballmanager.io')).toBe(false)
    expect(isSandboxHost('staging.footballmanager.io')).toBe(false)
  })

  it('does not match a host that merely contains "sandbox"', () => {
    expect(isSandboxHost('mysandbox.footballmanager.io')).toBe(false)
  })

  it('handles undefined or empty hostnames safely', () => {
    expect(isSandboxHost(undefined)).toBe(false)
    expect(isSandboxHost('')).toBe(false)
    expect(isSandboxHost(null)).toBe(false)
  })
})
