import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

// Mock dependencies
vi.mock('../../lib/database.js', () => ({
  query: vi.fn(),
  transaction: vi.fn(async (cb) => cb(vi.fn()))
}))

vi.mock('../../prepare-season.js', () => ({
  regenerateTeamData: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../lib/passwordHash.js', () => ({
  hashPassword: vi.fn(p => Promise.resolve(`hashed:${p}`)),
  verifyPassword: vi.fn((p, h) => Promise.resolve(h === `hashed:${p}`))
}))

vi.mock('../../lib/email.js', () => ({
  isValidEmail: (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
  sendVerificationEmail: vi.fn().mockResolvedValue({ sent: true, url: 'https://example.com/verify' }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ sent: true, url: 'https://example.com/reset' })
}))

vi.mock('../../helper/referralHelper.js', () => ({
  claimReferralForNewUser: vi.fn().mockResolvedValue({ linked: false }),
  awardReferralForVerifiedUser: vi.fn().mockResolvedValue({ awarded: false })
}))

vi.mock('../../helper/linkInviteHelper.js', () => ({
  claimLinkInviteForNewUser: vi.fn().mockResolvedValue({ linked: false }),
  awardLinkInviteForVerifiedUser: vi.fn().mockResolvedValue({ awarded: false })
}))

vi.mock('../../lib/userCache.js', () => ({
  clearUserCache: vi.fn()
}))

vi.mock('../../helper/emailBlockHelper.js', () => ({
  isEmailBlocked: vi.fn().mockResolvedValue(false),
  userHasBlockedEmail: vi.fn().mockResolvedValue(false)
}))

// Import after mocking
import { query, transaction } from '../../lib/database.js'
import { hashPassword } from '../../lib/passwordHash.js'
import { sendVerificationEmail, sendPasswordResetEmail } from '../../lib/email.js'
import { claimReferralForNewUser, awardReferralForVerifiedUser } from '../../helper/referralHelper.js'
import { claimLinkInviteForNewUser, awardLinkInviteForVerifiedUser } from '../../helper/linkInviteHelper.js'
import { isEmailBlocked, userHasBlockedEmail } from '../../helper/emailBlockHelper.js'
import { regenerateTeamData } from '../../prepare-season.js'
import handlers from '../../routes/auth.js'

describe('auth routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('login', () => {
    it('returns token for valid credentials', async () => {
      const user = testData.user({ password: 'hashed:password123' })
      query.mockResolvedValue([user])

      const req = { locale: 'en', headers: {} }
      const result = await handlers.login('testuser', 'password123', req)

      expect(result).toHaveProperty('token')
      expect(typeof result.token).toBe('string')
      expect(query).toHaveBeenCalledWith('SELECT * FROM user WHERE username=?', ['testuser'])
    })

    it('refuses the login when the account email is blocked', async () => {
      const user = testData.user({ password: 'hashed:password123' })
      query.mockResolvedValue([user])
      userHasBlockedEmail.mockResolvedValueOnce(true)

      const req = { locale: 'en', headers: {} }
      await expect(handlers.login('testuser', 'password123', req))
        .rejects.toMatchObject({ message: 'This account has been blocked. Please contact support.' })
    })

    it('checks the block only after the password matched', async () => {
      const user = testData.user({ password: 'hashed:correctpassword' })
      query.mockResolvedValue([user])

      const req = { locale: 'en', headers: {} }
      await expect(handlers.login('testuser', 'wrongpassword', req)).rejects.toThrow()
      expect(userHasBlockedEmail).not.toHaveBeenCalled()
    })

    it('throws BadRequestError for non-string username', async () => {
      const req = { locale: 'en' }
      await expect(handlers.login(123, 'password', req))
        .rejects.toMatchObject({ message: 'Username needs to be string' })
    })

    it('throws BadRequestError for non-string password', async () => {
      const req = { locale: 'en' }
      await expect(handlers.login('testuser', 123, req))
        .rejects.toMatchObject({ message: 'Password needs to be string' })
    })

    it('throws UnauthorizedError for wrong password', async () => {
      const user = testData.user({ password: 'hashed:correctpassword' })
      query.mockResolvedValue([user])

      const req = { locale: 'en' }
      await expect(handlers.login('testuser', 'wrongpassword', req))
        .rejects.toMatchObject({ message: 'Wrong credentials' })
    })

    it('throws UnauthorizedError for non-existent user', async () => {
      query.mockResolvedValue([])

      const req = { locale: 'en' }
      await expect(handlers.login('nonexistent', 'password', req))
        .rejects.toMatchObject({ message: 'Wrong credentials' })
    })

    it('persists the device UUID when one is supplied', async () => {
      const user = testData.user({ id: 42, password: 'hashed:password123' })
      query.mockResolvedValue([user])

      const req = { locale: 'en', headers: {} }
      await handlers.login('testuser', 'password123', 'web', 'abc-123-uuid', req)

      const upsertCall = query.mock.calls.find(c => /INSERT INTO user_device/.test(c[0]))
      expect(upsertCall).toBeDefined()
      expect(upsertCall[1]).toEqual([42, 'abc-123-uuid'])
    })

    it('skips device UUID upsert when none is supplied (legacy client)', async () => {
      const user = testData.user({ id: 42, password: 'hashed:password123' })
      query.mockResolvedValue([user])

      const req = { locale: 'en', headers: {} }
      await handlers.login('testuser', 'password123', 'web', req)

      const upsertCall = query.mock.calls.find(c => /INSERT INTO user_device/.test(c[0]))
      expect(upsertCall).toBeUndefined()
    })

    it('rejects an invalid-shaped device UUID without writing', async () => {
      const user = testData.user({ id: 42, password: 'hashed:password123' })
      query.mockResolvedValue([user])

      const req = { locale: 'en', headers: {} }
      await handlers.login('testuser', 'password123', 'web', 'bad uuid with spaces', req)

      const upsertCall = query.mock.calls.find(c => /INSERT INTO user_device/.test(c[0]))
      expect(upsertCall).toBeUndefined()
    })
  })

  describe('createAccount', () => {
    it('creates the user without assigning a team', async () => {
      query
        .mockResolvedValueOnce([{ amount: 0 }]) // username check
        .mockResolvedValueOnce({ insertId: 1 }) // insert user

      const req = { locale: 'en' }
      const result = await handlers.createAccount('newuser', 'password123', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('SELECT COUNT(*) AS amount FROM user WHERE username=?', 'newuser')
      expect(hashPassword).toHaveBeenCalledWith('password123')
      expect(query).toHaveBeenCalledWith('INSERT INTO user SET ?', expect.objectContaining({
        username: 'newuser',
        password: 'hashed:password123'
      }))
      // No team-related queries fire during createAccount anymore.
      const calls = query.mock.calls.map(args => args[0])
      expect(calls.some(sql => /FROM team/.test(sql))).toBe(false)
      expect(calls.some(sql => /UPDATE team/.test(sql))).toBe(false)
    })

    it('throws BadRequestError for non-string username', async () => {
      const req = { locale: 'en' }
      await expect(handlers.createAccount(123, 'password123', req))
        .rejects.toMatchObject({ message: 'Username needs to be string' })
    })

    it('throws BadRequestError for short password', async () => {
      const req = { locale: 'en' }
      await expect(handlers.createAccount('user', 'short', req))
        .rejects.toMatchObject({ message: 'Password needs to be string longer than 8 characters' })
    })

    it('throws BadRequestError for taken username', async () => {
      query.mockResolvedValueOnce([{ amount: 1 }])

      const req = { locale: 'en' }
      await expect(handlers.createAccount('existinguser', 'password123', req))
        .rejects.toMatchObject({ message: 'Username already taken' })
    })

    it('accepts a valid email and sends a verification mail', async () => {
      query
        .mockResolvedValueOnce([]) // emailIsTakenByAnotherUser check
        .mockResolvedValueOnce([{ amount: 0 }]) // username check
        .mockResolvedValueOnce({ insertId: 1 }) // insert user

      sendVerificationEmail.mockResolvedValue({ sent: true, url: 'x' })

      const req = { locale: 'en' }
      const result = await handlers.createAccount('newuser', 'password123', 'New@Example.com', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'INSERT INTO user SET ?',
        expect.objectContaining({
          username: 'newuser',
          pending_email: 'new@example.com',
          email_verification_token: expect.any(String)
        })
      )
      expect(sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({
        toEmail: 'new@example.com',
        token: expect.any(String),
        locale: 'en',
        username: 'newuser'
      }))
    })

    it('rejects an invalid email', async () => {
      const req = { locale: 'en' }
      await expect(handlers.createAccount('user', 'password123', 'not-an-email', req))
        .rejects.toMatchObject({ message: 'Please enter a valid email address' })
    })

    it('rejects an email already taken by another user', async () => {
      query.mockResolvedValueOnce([{ id: 99 }]) // emailIsTakenByAnotherUser returns existing
      const req = { locale: 'en' }
      await expect(handlers.createAccount('user', 'password123', 'taken@example.com', req))
        .rejects.toMatchObject({ message: 'This email address is already in use' })
    })

    it('rejects registration with a blocked email', async () => {
      isEmailBlocked.mockResolvedValueOnce(true)
      const req = { locale: 'en' }
      await expect(handlers.createAccount('user', 'password123', 'Blocked@Example.com', req))
        .rejects.toMatchObject({ message: 'This email address cannot be used' })
      expect(isEmailBlocked).toHaveBeenCalledWith('blocked@example.com')
    })

    it('claims a pending referral after the user is inserted', async () => {
      query
        .mockResolvedValueOnce([]) // emailIsTakenByAnotherUser check
        .mockResolvedValueOnce([{ amount: 0 }]) // username check
        .mockResolvedValueOnce({ insertId: 123 }) // insert user

      sendVerificationEmail.mockResolvedValue({ sent: true, url: 'x' })
      claimReferralForNewUser.mockResolvedValueOnce({ linked: true, inviterUserId: 7, action: 'BONUS_100K' })

      const req = { locale: 'en' }
      await handlers.createAccount('newuser', 'password123', 'new@example.com', req)

      expect(claimReferralForNewUser).toHaveBeenCalledWith({
        email: 'new@example.com',
        newUserId: 123
      })
    })

    it('does not call claimReferralForNewUser when no email is provided', async () => {
      query
        .mockResolvedValueOnce([{ amount: 0 }])
        .mockResolvedValueOnce({ insertId: 1 })

      const req = { locale: 'en' }
      await handlers.createAccount('newuser', 'password123', req)

      expect(claimReferralForNewUser).not.toHaveBeenCalled()
    })

    it('claims a link invite by IP even when no email is provided', async () => {
      query
        .mockResolvedValueOnce([{ amount: 0 }]) // username check
        .mockResolvedValueOnce({ insertId: 55 }) // insert user

      const req = { locale: 'en', headers: { 'x-forwarded-for': '9.9.9.9' } }
      await handlers.createAccount('newuser', 'password123', req)

      expect(claimLinkInviteForNewUser).toHaveBeenCalledWith({ ip: '9.9.9.9', newUserId: 55 })
    })
  })

  describe('setPassword', () => {
    it('updates the password when the old one matches', async () => {
      query
        .mockResolvedValueOnce([{ password: 'hashed:oldpass!!' }]) // SELECT password
        .mockResolvedValueOnce({}) // UPDATE user

      const req = { locale: 'en', user: { id: 42 } }
      const result = await handlers.setPassword('oldpass!!', 'newpass123', req)

      expect(result).toEqual({ success: true })
      expect(hashPassword).toHaveBeenCalledWith('newpass123')
      expect(query).toHaveBeenCalledWith(
        'UPDATE user SET password=? WHERE id=?',
        ['hashed:newpass123', 42]
      )
    })

    it('rejects when not authenticated', async () => {
      const req = { locale: 'en' }
      await expect(handlers.setPassword('oldpass!!', 'newpass123', req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('rejects when new password is too short', async () => {
      const req = { locale: 'en', user: { id: 1 } }
      await expect(handlers.setPassword('oldpass!!', 'short', req))
        .rejects.toMatchObject({ message: 'Password needs to be string longer than 8 characters' })
    })

    it('rejects when old password does not match', async () => {
      query.mockResolvedValueOnce([{ password: 'hashed:differentpass' }])
      const req = { locale: 'en', user: { id: 1 } }
      await expect(handlers.setPassword('oldpass!!', 'newpass123', req))
        .rejects.toMatchObject({ message: 'The current password is incorrect' })
    })

    it('rejects when either argument is not a string', async () => {
      const req = { locale: 'en', user: { id: 1 } }
      await expect(handlers.setPassword(123, 'newpass123', req))
        .rejects.toMatchObject({ message: 'Password needs to be string' })
    })
  })

  describe('setEmail', () => {
    it('stores a new email as pending and sends a verification mail', async () => {
      query
        .mockResolvedValueOnce([]) // emailIsTakenByAnotherUser check
        .mockResolvedValueOnce({}) // UPDATE user
      sendVerificationEmail.mockResolvedValue({ sent: true, url: 'x' })

      const req = { locale: 'en', user: { id: 42, username: 'me', email: null } }
      const result = await handlers.setEmail('Me@Example.com', req)

      expect(result).toEqual({ pendingEmail: 'me@example.com' })
      expect(query).toHaveBeenCalledWith(
        'UPDATE user SET pending_email=?, email_verification_token=?, email_verification_expires_at=? WHERE id=?',
        expect.arrayContaining(['me@example.com', expect.any(String), expect.any(Date), 42])
      )
      expect(sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({
        toEmail: 'me@example.com',
        username: 'me'
      }))
    })

    it('rejects an invalid email', async () => {
      const req = { locale: 'en', user: { id: 1, username: 'me' } }
      await expect(handlers.setEmail('bad', req))
        .rejects.toMatchObject({ message: 'Please enter a valid email address' })
    })

    it('rejects an email already used by another user', async () => {
      query.mockResolvedValueOnce([{ id: 99 }])
      const req = { locale: 'en', user: { id: 1, username: 'me' } }
      await expect(handlers.setEmail('taken@example.com', req))
        .rejects.toMatchObject({ message: 'This email address is already in use' })
    })

    it('clears pending change when setting to already-verified email', async () => {
      query.mockResolvedValueOnce({}) // UPDATE user
      const req = { locale: 'en', user: { id: 1, username: 'me', email: 'me@example.com' } }
      const result = await handlers.setEmail('me@example.com', req)
      expect(result).toEqual({ pendingEmail: null })
      expect(sendVerificationEmail).not.toHaveBeenCalled()
    })

    it('rejects when not authenticated', async () => {
      const req = { locale: 'en' }
      await expect(handlers.setEmail('a@b.com', req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })
  })

  describe('setEmailOptOut', () => {
    it('persists opt-out flag as 1 when true', async () => {
      query.mockResolvedValueOnce({})
      const req = { locale: 'en', user: { id: 42 } }
      const result = await handlers.setEmailOptOut(true, req)
      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'UPDATE user SET email_opt_out=? WHERE id=?',
        [1, 42]
      )
    })

    it('persists opt-out flag as 0 when false', async () => {
      query.mockResolvedValueOnce({})
      const req = { locale: 'en', user: { id: 42 } }
      await handlers.setEmailOptOut(false, req)
      expect(query).toHaveBeenCalledWith(
        'UPDATE user SET email_opt_out=? WHERE id=?',
        [0, 42]
      )
    })

    it('rejects when not authenticated', async () => {
      const req = { locale: 'en' }
      await expect(handlers.setEmailOptOut(true, req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })
  })

  describe('verifyEmail', () => {
    it('promotes the pending email to verified on success', async () => {
      const expires = new Date(Date.now() + 60 * 1000)
      query
        .mockResolvedValueOnce([{ id: 5, username: 'me', pending_email: 'new@example.com', email_verification_expires_at: expires }])
        .mockResolvedValueOnce([]) // conflict check
        .mockResolvedValueOnce({}) // UPDATE user

      const req = { locale: 'en' }
      const result = await handlers.verifyEmail('a'.repeat(64), req)

      expect(result).toEqual({ success: true, email: 'new@example.com' })
      expect(query).toHaveBeenCalledWith(
        'UPDATE user SET email=?, pending_email=NULL, email_verification_token=NULL, email_verification_expires_at=NULL WHERE id=?',
        ['new@example.com', 5]
      )
      expect(awardReferralForVerifiedUser).toHaveBeenCalledWith({ userId: 5 })
      expect(awardLinkInviteForVerifiedUser).toHaveBeenCalledWith({ userId: 5 })
    })

    it('does not call awardReferralForVerifiedUser when the token is invalid', async () => {
      query.mockResolvedValueOnce([])
      const req = { locale: 'en' }
      await expect(handlers.verifyEmail('a'.repeat(64), req)).rejects.toBeTruthy()
      expect(awardReferralForVerifiedUser).not.toHaveBeenCalled()
      expect(awardLinkInviteForVerifiedUser).not.toHaveBeenCalled()
    })

    it('rejects an unknown token', async () => {
      query.mockResolvedValueOnce([])
      const req = { locale: 'en' }
      await expect(handlers.verifyEmail('a'.repeat(64), req))
        .rejects.toMatchObject({ message: 'This verification link is invalid or has expired' })
    })

    it('rejects an expired token', async () => {
      const expires = new Date(Date.now() - 60 * 1000)
      query.mockResolvedValueOnce([{ id: 5, username: 'me', pending_email: 'new@example.com', email_verification_expires_at: expires }])
      const req = { locale: 'en' }
      await expect(handlers.verifyEmail('a'.repeat(64), req))
        .rejects.toMatchObject({ message: 'This verification link is invalid or has expired' })
    })

    it('rejects a malformed token', async () => {
      const req = { locale: 'en' }
      await expect(handlers.verifyEmail('short', req))
        .rejects.toMatchObject({ message: 'This verification link is invalid or has expired' })
    })
  })

  describe('requestPasswordReset', () => {
    it('generates a token and sends an email when the email matches a user', async () => {
      query
        .mockResolvedValueOnce([{ id: 7, username: 'someone', email: 'me@example.com', language: 'de' }])
        .mockResolvedValueOnce({}) // UPDATE user
      sendPasswordResetEmail.mockResolvedValue({ sent: true, url: 'x' })

      const req = { locale: 'en' }
      const result = await handlers.requestPasswordReset('Me@Example.com', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'SELECT id, username, email, language FROM user WHERE email=? LIMIT 1',
        ['me@example.com']
      )
      expect(query).toHaveBeenCalledWith(
        'UPDATE user SET password_reset_token=?, password_reset_expires_at=? WHERE id=?',
        [expect.any(String), expect.any(Date), 7]
      )
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.objectContaining({
        toEmail: 'me@example.com',
        username: 'someone',
        locale: 'de',
        token: expect.any(String)
      }))
    })

    it('returns success without sending email when no user matches', async () => {
      query.mockResolvedValueOnce([])
      const req = { locale: 'en' }
      const result = await handlers.requestPasswordReset('unknown@example.com', req)
      expect(result).toEqual({ success: true })
      expect(sendPasswordResetEmail).not.toHaveBeenCalled()
    })

    it('rejects an invalid email', async () => {
      const req = { locale: 'en' }
      await expect(handlers.requestPasswordReset('not-an-email', req))
        .rejects.toMatchObject({ message: 'Please enter a valid email address' })
    })
  })

  describe('resetPassword', () => {
    it('updates the password and clears the token on success', async () => {
      const expires = new Date(Date.now() + 60 * 60 * 1000)
      query
        .mockResolvedValueOnce([{ id: 9, password_reset_expires_at: expires }])
        .mockResolvedValueOnce({}) // UPDATE user

      const req = { locale: 'en' }
      const result = await handlers.resetPassword('a'.repeat(64), 'newpassword123', req)

      expect(result).toEqual({ success: true })
      expect(hashPassword).toHaveBeenCalledWith('newpassword123')
      expect(query).toHaveBeenCalledWith(
        'UPDATE user SET password=?, password_reset_token=NULL, password_reset_expires_at=NULL WHERE id=?',
        ['hashed:newpassword123', 9]
      )
    })

    it('rejects a malformed token', async () => {
      const req = { locale: 'en' }
      await expect(handlers.resetPassword('short', 'newpassword123', req))
        .rejects.toMatchObject({ message: 'This password reset link is invalid or has expired' })
    })

    it('rejects a short new password', async () => {
      const req = { locale: 'en' }
      await expect(handlers.resetPassword('a'.repeat(64), 'short', req))
        .rejects.toMatchObject({ message: 'Password needs to be string longer than 8 characters' })
    })

    it('rejects an unknown token', async () => {
      query.mockResolvedValueOnce([])
      const req = { locale: 'en' }
      await expect(handlers.resetPassword('a'.repeat(64), 'newpassword123', req))
        .rejects.toMatchObject({ message: 'This password reset link is invalid or has expired' })
    })

    it('rejects an expired token', async () => {
      const expires = new Date(Date.now() - 60 * 1000)
      query.mockResolvedValueOnce([{ id: 9, password_reset_expires_at: expires }])
      const req = { locale: 'en' }
      await expect(handlers.resetPassword('a'.repeat(64), 'newpassword123', req))
        .rejects.toMatchObject({ message: 'This password reset link is invalid or has expired' })
    })
  })

  describe('deleteAccount', () => {
    let txQuery
    beforeEach(() => {
      txQuery = vi.fn().mockResolvedValue([])
      transaction.mockImplementation(async (cb) => cb(txQuery))
      query.mockResolvedValue([]) // default for image-collection selects
    })

    it('regenerates bot defaults after stripping the team so the team keeps a stadium', async () => {
      const team = { id: 42, name: 'Bot FC', level: 3, formation: '442' }
      query.mockResolvedValueOnce([team]) // SELECT * FROM team WHERE user_id=?

      const req = { locale: 'en', user: { id: 7 } }
      const result = await handlers.deleteAccount(req)

      expect(result).toEqual({ success: true })
      expect(regenerateTeamData).toHaveBeenCalledWith(team)
      expect(transaction).toHaveBeenCalledTimes(1)
    })

    it('does not call regenerateTeamData when the user has no team', async () => {
      query.mockResolvedValueOnce([]) // SELECT * FROM team returns nothing

      const req = { locale: 'en', user: { id: 7 } }
      const result = await handlers.deleteAccount(req)

      expect(result).toEqual({ success: true })
      expect(regenerateTeamData).not.toHaveBeenCalled()
    })

    it('deletes the user-generated content tied to the account', async () => {
      query.mockResolvedValueOnce([]) // no team

      const req = { locale: 'en', user: { id: 7 } }
      await handlers.deleteAccount(req)

      const deletions = txQuery.mock.calls.map(c => c[0])
      const deletesFrom = (table) => deletions.some(sql => new RegExp(`DELETE FROM ${table}\\b`).test(sql))

      expect(deletesFrom('chat_message')).toBe(true)
      expect(deletesFrom('forum_comment_image')).toBe(true)
      expect(deletesFrom('forum_comment')).toBe(true)
      expect(deletesFrom('forum_post_image')).toBe(true)
      expect(deletesFrom('forum_post_like')).toBe(true)
      expect(deletesFrom('forum_post')).toBe(true)
      expect(deletesFrom('friend_post_like')).toBe(true)
      expect(deletesFrom('friend_post_comment')).toBe(true)
      expect(deletesFrom('friend_post')).toBe(true)
      expect(deletesFrom('news_like')).toBe(true)
      expect(deletesFrom('news_comment')).toBe(true)
      expect(deletesFrom('hall_of_fame_comment_like')).toBe(true)
      expect(deletesFrom('hall_of_fame_comment')).toBe(true)
      expect(deletesFrom('user_friend')).toBe(true)
      expect(deletesFrom('referral_invitation')).toBe(true)
      expect(deletesFrom('page_view')).toBe(true)
      expect(deletesFrom('client_log')).toBe(true)
      expect(deletesFrom('device_token')).toBe(true)
      // The user row is always deleted last.
      expect(deletions[deletions.length - 1]).toMatch(/DELETE FROM user WHERE id=\?/)
    })

    it('throws when no user is on the request', async () => {
      const req = { locale: 'en' }
      await expect(handlers.deleteAccount(req)).rejects.toMatchObject({ message: expect.any(String) })
      expect(regenerateTeamData).not.toHaveBeenCalled()
    })
  })
})
