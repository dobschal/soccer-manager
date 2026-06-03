import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 3, season: 9 })
}))

import {
  getReferralBenefit,
  setReferralBenefit,
  claimReferralForNewUser,
  awardReferralForVerifiedUser
} from '../../helper/referralHelper.js'
import { query } from '../../lib/database.js'

describe('referralHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getReferralBenefit', () => {
    it('returns the configured value', async () => {
      query.mockResolvedValueOnce([{ setting_value: 'STAR_PLAYER' }])
      const value = await getReferralBenefit()
      expect(value).toBe('STAR_PLAYER')
    })

    it('falls back to BONUS_100K when no row exists', async () => {
      query.mockResolvedValueOnce([])
      const value = await getReferralBenefit()
      expect(value).toBe('BONUS_100K')
    })
  })

  describe('setReferralBenefit', () => {
    it('upserts the setting value', async () => {
      await setReferralBenefit('STAR_PLAYER')
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO app_setting (setting_key, setting_value) VALUES ('referral_benefit', ?)"),
        ['STAR_PLAYER']
      )
    })
  })

  describe('claimReferralForNewUser', () => {
    it('is a no-op when email or new user id is missing', async () => {
      expect(await claimReferralForNewUser({ email: '', newUserId: 1 })).toEqual({ linked: false })
      expect(await claimReferralForNewUser({ email: 'a@b.com', newUserId: 0 })).toEqual({ linked: false })
      expect(query).not.toHaveBeenCalled()
    })

    it('does nothing when no pending invitation matches', async () => {
      query.mockResolvedValueOnce([])
      const result = await claimReferralForNewUser({ email: 'noone@example.com', newUserId: 42 })
      expect(result).toEqual({ linked: false })
      // Only the invitation lookup runs
      expect(query).toHaveBeenCalledTimes(1)
    })

    it('links the invitation to the new user without inserting an action card', async () => {
      query
        .mockResolvedValueOnce([{ id: 11, inviter_user_id: 7 }]) // invitation lookup
        .mockResolvedValueOnce([{ setting_value: 'STAR_PLAYER' }]) // getReferralBenefit
        .mockResolvedValueOnce({ affectedRows: 1 }) // update invitation

      const result = await claimReferralForNewUser({ email: 'friend@example.com', newUserId: 42 })

      expect(result).toEqual({ linked: true, inviterUserId: 7, action: 'STAR_PLAYER' })
      const calls = query.mock.calls.map(c => c[0])
      // Bonus is deferred: no action_card insert and no inviter team lookup yet
      expect(calls.some(sql => /INSERT INTO action_card/.test(sql))).toBe(false)
      expect(calls.some(sql => /FROM team/.test(sql))).toBe(false)
      expect(query).toHaveBeenCalledWith(
        'UPDATE referral_invitation SET used_by_user_id=?, used_at=NOW(), reward_action=? WHERE id=?',
        [42, 'STAR_PLAYER', 11]
      )
    })
  })

  describe('awardReferralForVerifiedUser', () => {
    it('is a no-op without a user id', async () => {
      expect(await awardReferralForVerifiedUser({ userId: 0 })).toEqual({ awarded: false })
      expect(query).not.toHaveBeenCalled()
    })

    it('does nothing when there is no linked-but-unrewarded invitation', async () => {
      query.mockResolvedValueOnce([])
      const result = await awardReferralForVerifiedUser({ userId: 42 })
      expect(result).toEqual({ awarded: false })
      expect(query).toHaveBeenCalledTimes(1)
    })

    it('marks the invitation rewarded even when the inviter has no team', async () => {
      query
        .mockResolvedValueOnce([{ id: 11, inviter_user_id: 7, reward_action: 'BONUS_100K' }])
        .mockResolvedValueOnce([]) // inviter team lookup — none
        .mockResolvedValueOnce({ affectedRows: 1 }) // update invitation rewarded_at

      const result = await awardReferralForVerifiedUser({ userId: 42 })

      expect(result).toEqual({ awarded: false, inviterUserId: 7, action: 'BONUS_100K' })
      const calls = query.mock.calls.map(c => c[0])
      expect(calls.some(sql => /INSERT INTO action_card/.test(sql))).toBe(false)
      expect(query).toHaveBeenCalledWith(
        'UPDATE referral_invitation SET rewarded_at=NOW() WHERE id=?',
        [11]
      )
    })

    it('awards the stored action to the inviter team and marks rewarded_at', async () => {
      query
        .mockResolvedValueOnce([{ id: 11, inviter_user_id: 7, reward_action: 'STAR_PLAYER' }])
        .mockResolvedValueOnce([{ id: 99 }]) // inviter team
        .mockResolvedValueOnce({ insertId: 1 }) // action_card insert
        .mockResolvedValueOnce({ affectedRows: 1 }) // update invitation rewarded_at

      const result = await awardReferralForVerifiedUser({ userId: 42 })

      expect(result).toEqual({ awarded: true, inviterUserId: 7, action: 'STAR_PLAYER' })
      expect(query).toHaveBeenCalledWith(
        'INSERT INTO action_card (team_id, action, played, state, season) VALUES (?, ?, 0, ?, ?)',
        [99, 'STAR_PLAYER', 'pending', 9]
      )
      expect(query).toHaveBeenCalledWith(
        'UPDATE referral_invitation SET rewarded_at=NOW() WHERE id=?',
        [11]
      )
    })

    it('falls back to the current admin benefit when reward_action is missing', async () => {
      query
        .mockResolvedValueOnce([{ id: 11, inviter_user_id: 7, reward_action: null }])
        .mockResolvedValueOnce([{ setting_value: 'STAR_PLAYER' }]) // getReferralBenefit
        .mockResolvedValueOnce([{ id: 99 }]) // inviter team
        .mockResolvedValueOnce({ insertId: 1 }) // action_card insert
        .mockResolvedValueOnce({ affectedRows: 1 }) // update invitation rewarded_at

      const result = await awardReferralForVerifiedUser({ userId: 42 })

      expect(result).toEqual({ awarded: true, inviterUserId: 7, action: 'STAR_PLAYER' })
    })
  })
})
