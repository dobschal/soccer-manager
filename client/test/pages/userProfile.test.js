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
vi.mock('../../i18n/index.js', () => ({ t: vi.fn((key) => key) }))

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
