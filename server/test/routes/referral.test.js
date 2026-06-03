import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/email.js', () => ({
  isValidEmail: (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
  sendReferralEmail: vi.fn().mockResolvedValue({ sent: true })
}))

vi.mock('../../helper/referralHelper.js', () => ({
  getReferralBenefit: vi.fn().mockResolvedValue('BONUS_100K'),
  setReferralBenefit: vi.fn().mockResolvedValue(undefined)
}))

import handlers from '../../routes/referral.js'
import { query } from '../../lib/database.js'
import { sendReferralEmail } from '../../lib/email.js'
import { getReferralBenefit, setReferralBenefit } from '../../helper/referralHelper.js'

describe('referral routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('inviteFriendByEmail', () => {
    it('rejects unauthenticated callers', async () => {
      await expect(handlers.inviteFriendByEmail('a@b.com', { locale: 'en' }))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('rejects invalid emails', async () => {
      await expect(handlers.inviteFriendByEmail('nope', { locale: 'en', user: { id: 1, username: 'me' } }))
        .rejects.toMatchObject({ message: 'Please enter a valid email address' })
    })

    it('rejects inviting yourself by verified email', async () => {
      const req = { locale: 'en', user: { id: 1, username: 'me', email: 'me@example.com' } }
      await expect(handlers.inviteFriendByEmail('Me@Example.com', req))
        .rejects.toMatchObject({ message: 'You cannot invite yourself' })
    })

    it('rejects inviting yourself by pending email', async () => {
      const req = { locale: 'en', user: { id: 1, username: 'me', pending_email: 'me@example.com' } }
      await expect(handlers.inviteFriendByEmail('me@example.com', req))
        .rejects.toMatchObject({ message: 'You cannot invite yourself' })
    })

    it('rejects emails that already belong to a user', async () => {
      query.mockResolvedValueOnce([{ id: 99 }])
      const req = { locale: 'en', user: { id: 1, username: 'me' } }
      await expect(handlers.inviteFriendByEmail('taken@example.com', req))
        .rejects.toMatchObject({ message: 'This email already belongs to a FootballManager.IO user' })
    })

    it('rejects when the pending-invite limit is reached', async () => {
      query
        .mockResolvedValueOnce([]) // existing user check
        .mockResolvedValueOnce([{ amount: 50 }]) // pending count

      const req = { locale: 'en', user: { id: 1, username: 'me' } }
      await expect(handlers.inviteFriendByEmail('new@example.com', req))
        .rejects.toMatchObject({ message: 'You have too many pending invitations — wait for some to be accepted' })
    })

    it('records the invitation and sends an email on success', async () => {
      query
        .mockResolvedValueOnce([]) // no existing user
        .mockResolvedValueOnce([{ amount: 0 }]) // pending count
        .mockResolvedValueOnce({ insertId: 7 }) // insert invitation

      sendReferralEmail.mockResolvedValueOnce({ sent: true })

      const req = { locale: 'en', user: { id: 42, username: 'inviter' } }
      const result = await handlers.inviteFriendByEmail('Friend@Example.com', req)

      expect(query).toHaveBeenCalledWith(
        'INSERT INTO referral_invitation (inviter_user_id, email) VALUES (?, ?)',
        [42, 'friend@example.com']
      )
      expect(sendReferralEmail).toHaveBeenCalledWith({
        toEmail: 'friend@example.com',
        locale: 'en',
        inviterUsername: 'inviter'
      })
      expect(result).toEqual({ success: true, sent: true })
    })
  })

  describe('getReferralSettings', () => {
    it('rejects non-admin users', async () => {
      await expect(handlers.getReferralSettings({ user: { is_admin: 0 } }))
        .rejects.toMatchObject({ message: 'This action is only available for admins' })
    })

    it('returns the configured action and the option list for admins', async () => {
      getReferralBenefit.mockResolvedValueOnce('STAR_PLAYER')
      const result = await handlers.getReferralSettings({ user: { is_admin: 1 } })
      expect(result.action).toBe('STAR_PLAYER')
      expect(result.options).toContain('BONUS_100K')
      expect(result.options).toContain('STAR_PLAYER')
    })
  })

  describe('setReferralBenefit', () => {
    it('rejects non-admin users', async () => {
      await expect(handlers.setReferralBenefit('BONUS_100K', { user: { is_admin: 0 } }))
        .rejects.toMatchObject({ message: 'This action is only available for admins' })
    })

    it('rejects unknown card types', async () => {
      await expect(handlers.setReferralBenefit('NOT_A_CARD', { user: { is_admin: 1 } }))
        .rejects.toMatchObject({ message: 'Invalid action card type' })
    })

    it('persists the new benefit', async () => {
      const result = await handlers.setReferralBenefit('STAR_PLAYER', { user: { is_admin: 1 } })
      expect(setReferralBenefit).toHaveBeenCalledWith('STAR_PLAYER')
      expect(result).toEqual({ success: true, action: 'STAR_PLAYER' })
    })
  })
})
