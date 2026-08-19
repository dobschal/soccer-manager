import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getUserProfile: vi.fn(),
    isFriend: vi.fn(),
    addFriend: vi.fn(),
    removeFriend: vi.fn()
  },
  showServerError: vi.fn()
}))
vi.mock('../../lib/router.js', () => ({ goTo: vi.fn() }))
vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../i18n/index.js', () => ({ t: vi.fn((key) => key), getLocale: vi.fn(() => 'en') }))

import { UserProfilePage } from '../../pages/userProfile.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'

describe('UserProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('#438 stale/cached user', () => {
    it('caches separate instances per user id', () => {
      expect(UserProfilePage.cacheKeyParams).toEqual(['id'])
    })

    it('reloads when the requested user id changes', async () => {
      const page = new UserProfilePage()
      page.userId = 1
      page.profile = { isOwnProfile: false, user: { id: 1 } }
      page.update = vi.fn()

      await page.onQueryChanged({ id: 2 })

      expect(page.userId).toBe(2)
      expect(page.profile).toBeNull()
      expect(page.update).toHaveBeenCalledWith(true)
    })

    it('does not reload when the id is unchanged', async () => {
      const page = new UserProfilePage()
      page.userId = 5
      page.profile = { isOwnProfile: false, user: { id: 5 } }
      page.update = vi.fn()

      await page.onQueryChanged({ id: 5 })

      expect(page.update).not.toHaveBeenCalled()
    })

    it('loads friend status for the requested user in load()', async () => {
      server.getUserProfile.mockResolvedValue({ isOwnProfile: false, user: { id: 7 } })
      server.isFriend.mockResolvedValue({ isFriend: true })
      const page = new UserProfilePage()
      page.userId = 7

      await page.load()

      expect(server.getUserProfile).toHaveBeenCalledWith(7)
      expect(server.isFriend).toHaveBeenCalledWith(7)
      expect(page._isFriend).toBe(true)
      expect(page._canBeFriend).toBe(true)
    })

    it('does not offer friending on the own profile', async () => {
      server.getUserProfile.mockResolvedValue({ isOwnProfile: true, user: { id: 7 } })
      const page = new UserProfilePage()
      page.userId = 7

      await page.load()

      expect(server.isFriend).not.toHaveBeenCalled()
      expect(page._canBeFriend).toBe(false)
    })
  })

  describe('#447 joined / last login dates', () => {
    it('renders joined and last login in the header', () => {
      const page = new UserProfilePage()
      const html = page._renderHeader(
        { id: 1, username: 'Tester', avatar: null, joinedAt: '2024-01-15T10:00:00Z', lastLogin: '2024-06-01T08:00:00Z' },
        null,
        false
      )
      expect(html).toContain('userProfile.joinedAt')
      expect(html).toContain('15.01.2024')
      expect(html).toContain('userProfile.lastLogin')
    })

    it('omits the joined line when joinedAt is missing', () => {
      const page = new UserProfilePage()
      const html = page._renderHeader(
        { id: 1, username: 'Tester', avatar: null, joinedAt: null, lastLogin: null },
        null,
        false
      )
      expect(html).not.toContain('userProfile.joinedAt')
      expect(html).toContain('userProfile.lastLogin')
    })
  })

  describe('country and language', () => {
    it('renders the country with flag and the selected language', () => {
      const page = new UserProfilePage()
      const html = page._renderHeader(
        { id: 1, username: 'Tester', avatar: null, country: 'DE', language: 'de' },
        null,
        false
      )
      expect(html).toContain('Germany')
      expect(html).toContain('https://flagcdn.com/w40/de.png')
      expect(html).toContain('common.german')
    })

    it('renders the country alone when no language is stored', () => {
      const page = new UserProfilePage()
      const html = page._renderHeader(
        { id: 1, username: 'Tester', avatar: null, country: 'AT', language: null },
        null,
        false
      )
      expect(html).toContain('Austria')
      expect(html).not.toContain('common.language')
    })

    it('omits the whole row when neither is known', () => {
      const page = new UserProfilePage()
      expect(page._renderOrigin({ country: null, language: null })).toBe('')
    })
  })

  describe('#421 report user button', () => {
    it('renders a report button on other users profiles', () => {
      const page = new UserProfilePage()
      const html = page._renderHeader(
        { id: 2, username: 'Other', avatar: null },
        null,
        false
      )
      expect(html).toContain('report-user-btn')
    })

    it('does not render a report button on the own profile', () => {
      const page = new UserProfilePage()
      const html = page._renderHeader(
        { id: 1, username: 'Me', avatar: null },
        null,
        true
      )
      expect(html).not.toContain('report-user-btn')
    })
  })

  describe('#439 add friend button', () => {
    it('renders an "add friend" button for other users', () => {
      const page = new UserProfilePage()
      page._canBeFriend = true
      page._isFriend = false
      const html = page._renderFriendToggleButton()
      expect(html).toContain('friend-toggle-btn')
      expect(html).toContain('team.addFriend')
    })

    it('renders a "remove friend" button when already friends', () => {
      const page = new UserProfilePage()
      page._canBeFriend = true
      page._isFriend = true
      expect(page._renderFriendToggleButton()).toContain('team.removeFriend')
    })

    it('renders nothing when friending is not possible', () => {
      const page = new UserProfilePage()
      page._canBeFriend = false
      expect(page._renderFriendToggleButton()).toBe('')
    })

    it('adds a friend on click', async () => {
      server.addFriend.mockResolvedValue({})
      const page = new UserProfilePage()
      page._canBeFriend = true
      page._isFriend = false
      page.userId = 42
      page.update = vi.fn()

      await page._handleFriendToggleClick()

      expect(server.addFriend).toHaveBeenCalledWith(42)
      expect(page._isFriend).toBe(true)
      expect(toast).toHaveBeenCalledWith('team.friendAdded', 'success')
    })

    it('removes a friend on click when already friends', async () => {
      server.removeFriend.mockResolvedValue({})
      const page = new UserProfilePage()
      page._canBeFriend = true
      page._isFriend = true
      page.userId = 42
      page.update = vi.fn()

      await page._handleFriendToggleClick()

      expect(server.removeFriend).toHaveBeenCalledWith(42)
      expect(page._isFriend).toBe(false)
    })
  })
})
