import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/referralHelper.js', () => ({
  getReferralBenefit: vi.fn().mockResolvedValue('BONUS_100K')
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 3, season: 9 })
}))

import {
  recordLinkInvite,
  claimLinkInviteForNewUser,
  awardLinkInviteForVerifiedUser
} from '../../helper/linkInviteHelper.js'
import { query } from '../../lib/database.js'
import { getReferralBenefit } from '../../helper/referralHelper.js'

describe('linkInviteHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('recordLinkInvite', () => {
    it('is a no-op without inviter, ip, or for unknown ip', async () => {
      expect(await recordLinkInvite({ inviterUserId: 0, ip: '1.2.3.4' })).toEqual({ recorded: false })
      expect(await recordLinkInvite({ inviterUserId: 7, ip: '' })).toEqual({ recorded: false })
      expect(await recordLinkInvite({ inviterUserId: 7, ip: 'unknown' })).toEqual({ recorded: false })
      expect(query).not.toHaveBeenCalled()
    })

    it('drops earlier unclaimed clicks for the ip then inserts the new invite', async () => {
      query
        .mockResolvedValueOnce({ affectedRows: 1 }) // delete prior
        .mockResolvedValueOnce({ insertId: 5 }) // insert

      const result = await recordLinkInvite({ inviterUserId: 7, ip: '1.2.3.4' })

      expect(result).toEqual({ recorded: true })
      expect(query).toHaveBeenCalledWith(
        'DELETE FROM link_invite WHERE invitee_ip=? AND used_by_user_id IS NULL',
        ['1.2.3.4']
      )
      expect(query).toHaveBeenCalledWith(
        'INSERT INTO link_invite (inviter_user_id, invitee_ip) VALUES (?, ?)',
        [7, '1.2.3.4']
      )
    })
  })

  describe('claimLinkInviteForNewUser', () => {
    it('is a no-op for unknown ip or missing user id', async () => {
      expect(await claimLinkInviteForNewUser({ ip: 'unknown', newUserId: 1 })).toEqual({ linked: false })
      expect(await claimLinkInviteForNewUser({ ip: '1.2.3.4', newUserId: 0 })).toEqual({ linked: false })
      expect(query).not.toHaveBeenCalled()
    })

    it('does nothing when no matching invite exists', async () => {
      query.mockResolvedValueOnce([])
      const result = await claimLinkInviteForNewUser({ ip: '1.2.3.4', newUserId: 42 })
      expect(result).toEqual({ linked: false })
      expect(query).toHaveBeenCalledTimes(1)
    })

    it('links the invite and creates a bilateral friendship without awarding yet', async () => {
      query
        .mockResolvedValueOnce([{ id: 11, inviter_user_id: 7 }]) // invite lookup
        .mockResolvedValueOnce({ affectedRows: 1 }) // update invite
        .mockResolvedValueOnce({ affectedRows: 2 }) // user_friend insert
      getReferralBenefit.mockResolvedValueOnce('STAR_PLAYER')

      const result = await claimLinkInviteForNewUser({ ip: '1.2.3.4', newUserId: 42 })

      expect(result).toEqual({ linked: true, inviterUserId: 7, action: 'STAR_PLAYER' })
      const calls = query.mock.calls.map(c => c[0])
      expect(calls.some(sql => /INSERT INTO action_card/.test(sql))).toBe(false)
      expect(query).toHaveBeenCalledWith(
        'UPDATE link_invite SET used_by_user_id=?, used_at=NOW(), reward_action=? WHERE id=?',
        [42, 'STAR_PLAYER', 11]
      )
      expect(query).toHaveBeenCalledWith(
        'INSERT IGNORE INTO user_friend (user_id, friend_user_id) VALUES (?, ?), (?, ?)',
        [7, 42, 42, 7]
      )
    })

    it('excludes self-invites via the SQL guard (inviter_user_id <> newUserId)', async () => {
      query.mockResolvedValueOnce([])
      await claimLinkInviteForNewUser({ ip: '1.2.3.4', newUserId: 42 })
      const params = query.mock.calls[0][1]
      expect(params).toContain(42)
    })
  })

  describe('awardLinkInviteForVerifiedUser', () => {
    it('is a no-op without a user id', async () => {
      expect(await awardLinkInviteForVerifiedUser({ userId: 0 })).toEqual({ awarded: false })
      expect(query).not.toHaveBeenCalled()
    })

    it('does nothing when there is no linked-but-unrewarded invite', async () => {
      query.mockResolvedValueOnce([])
      const result = await awardLinkInviteForVerifiedUser({ userId: 42 })
      expect(result).toEqual({ awarded: false })
      expect(query).toHaveBeenCalledTimes(1)
    })

    it('marks rewarded even when the inviter has no team', async () => {
      query
        .mockResolvedValueOnce([{ id: 11, inviter_user_id: 7, reward_action: 'BONUS_100K' }])
        .mockResolvedValueOnce([]) // inviter team lookup — none
        .mockResolvedValueOnce({ affectedRows: 1 }) // update rewarded_at

      const result = await awardLinkInviteForVerifiedUser({ userId: 42 })

      expect(result).toEqual({ awarded: false, inviterUserId: 7, action: 'BONUS_100K' })
      const calls = query.mock.calls.map(c => c[0])
      expect(calls.some(sql => /INSERT INTO action_card/.test(sql))).toBe(false)
      expect(query).toHaveBeenCalledWith(
        'UPDATE link_invite SET rewarded_at=NOW() WHERE id=?',
        [11]
      )
    })

    it('awards the stored action to the inviter team and marks rewarded_at', async () => {
      query
        .mockResolvedValueOnce([{ id: 11, inviter_user_id: 7, reward_action: 'STAR_PLAYER' }])
        .mockResolvedValueOnce([{ id: 99 }]) // inviter team
        .mockResolvedValueOnce([{ heldCount: 0 }]) // canReceiveActionCard — below limit
        .mockResolvedValueOnce({ insertId: 1 }) // action_card insert
        .mockResolvedValueOnce({ affectedRows: 1 }) // update rewarded_at

      const result = await awardLinkInviteForVerifiedUser({ userId: 42 })

      expect(result).toEqual({ awarded: true, inviterUserId: 7, action: 'STAR_PLAYER' })
      expect(query).toHaveBeenCalledWith(
        'INSERT INTO action_card (team_id, action, played, state, season) VALUES (?, ?, 0, ?, ?)',
        [99, 'STAR_PLAYER', 'pending', 9]
      )
    })

    it('falls back to the current admin benefit when reward_action is missing', async () => {
      query
        .mockResolvedValueOnce([{ id: 11, inviter_user_id: 7, reward_action: null }])
        .mockResolvedValueOnce([{ id: 99 }]) // inviter team
        .mockResolvedValueOnce([{ heldCount: 0 }]) // canReceiveActionCard — below limit
        .mockResolvedValueOnce({ insertId: 1 }) // action_card insert
        .mockResolvedValueOnce({ affectedRows: 1 }) // update rewarded_at
      getReferralBenefit.mockResolvedValueOnce('STAR_PLAYER')

      const result = await awardLinkInviteForVerifiedUser({ userId: 42 })

      expect(result).toEqual({ awarded: true, inviterUserId: 7, action: 'STAR_PLAYER' })
    })
  })
})
