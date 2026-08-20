import { describe, it, expect } from 'vitest'
import { DISCORD_INVITE_URL, discordLinkHtml } from '../../lib/discord.js'

describe('Discord invite link (#557)', () => {
  it('points at the current community invite', () => {
    expect(DISCORD_INVITE_URL).toBe('https://discord.gg/r7NgarY8w')
  })

  it('renders an anchor that opens the invite in a new tab', () => {
    const html = discordLinkHtml({ label: 'Join' })
    expect(html).toContain(`href="${DISCORD_INVITE_URL}"`)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('<span>Join</span>')
  })
})
