import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn(), onClose: vi.fn() }))
}))
vi.mock('../../i18n/index.js', () => ({ t: (key) => key }))
const instances = []
vi.mock('../../pages/userProfile.js', () => ({
  UserProfilePage: class {
    constructor () { instances.push(this) }
    toString () { return '<div class="user-profile-page"></div>' }
  }
}))

import { showUserProfileOverlay } from '../../partials/userProfileOverlay.js'
import { showOverlay } from '../../partials/overlay.js'

beforeEach(() => {
  vi.clearAllMocks()
  instances.length = 0
})

describe('showUserProfileOverlay (#532)', () => {
  it('opens an overlay containing the profile page', () => {
    showUserProfileOverlay(42)
    expect(showOverlay).toHaveBeenCalledTimes(1)
    expect(showOverlay.mock.calls[0][2]).toContain('user-profile-page')
  })

  it('passes the requested user id to the page', () => {
    showUserProfileOverlay(42)
    expect(instances[0].userId).toBe(42)
  })

  it('flags the page so it does not navigate away on error', () => {
    // The page bails to the dashboard when it cannot load — inside an overlay
    // there is nothing to navigate away from.
    showUserProfileOverlay(42)
    expect(instances[0].inOverlay).toBe(true)
  })

  it('ignores an invalid user id instead of opening an empty overlay', () => {
    expect(showUserProfileOverlay(0)).toBe(null)
    expect(showUserProfileOverlay(-3)).toBe(null)
    expect(showUserProfileOverlay('abc')).toBe(null)
    expect(showUserProfileOverlay(undefined)).toBe(null)
    expect(showOverlay).not.toHaveBeenCalled()
  })

  it('accepts a numeric string id', () => {
    showUserProfileOverlay('42')
    expect(showOverlay).toHaveBeenCalledTimes(1)
    expect(instances[0].userId).toBe(42)
  })

  it('returns the overlay handle so callers can close it', () => {
    const handle = showUserProfileOverlay(42)
    expect(handle).toHaveProperty('remove')
  })
})
