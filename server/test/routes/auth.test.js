import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

// Mock dependencies
vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

vi.mock('../../helper/sponsorHelper.js', () => ({
  getSponsor: vi.fn()
}))

vi.mock('../../prepare-season.js', () => ({
  prepareSeason: vi.fn(),
  regenerateTeamData: vi.fn()
}))

vi.mock('../../lib/passwordHash.js', () => ({
  hashPassword: vi.fn(p => Promise.resolve(`hashed:${p}`)),
  verifyPassword: vi.fn((p, h) => Promise.resolve(h === `hashed:${p}`))
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 1, season: 1 })
}))

vi.mock('../../lib/email.js', () => ({
  isValidEmail: (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
  sendVerificationEmail: vi.fn().mockResolvedValue({ sent: true, url: 'https://example.com/verify' })
}))

vi.mock('../../lib/userCache.js', () => ({
  clearUserCache: vi.fn()
}))

// Import after mocking
import { query } from '../../lib/database.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import { getSponsor } from '../../helper/sponsorHelper.js'
import { prepareSeason } from '../../prepare-season.js'
import { hashPassword } from '../../lib/passwordHash.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { sendVerificationEmail } from '../../lib/email.js'
import handlers from '../../routes/auth.js'

describe('auth routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 1 })
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
  })

  describe('createAccount', () => {
    it('creates account successfully when team available', async () => {
      const team = testData.team({ user_id: null })
      query
        .mockResolvedValueOnce([{ amount: 0 }]) // username check
        .mockResolvedValueOnce([team]) // get available team
        .mockResolvedValueOnce({ insertId: 1 }) // insert user
        .mockResolvedValueOnce({}) // update team
        .mockResolvedValueOnce({}) // delete sponsor
        .mockResolvedValueOnce({}) // delete action cards

      addLogMessage.mockResolvedValue()
      getSponsor.mockResolvedValue({ sponsor: { id: 1 } })

      const req = { locale: 'en' }
      const result = await handlers.createAccount('newuser', 'password123', req)

      expect(result).toEqual({ success: true })
      expect(prepareSeason).not.toHaveBeenCalled()
      expect(query).toHaveBeenCalledWith('SELECT COUNT(*) AS amount FROM user WHERE username=?', 'newuser')
      expect(hashPassword).toHaveBeenCalledWith('password123')
      expect(query).toHaveBeenCalledWith('INSERT INTO user SET ?', expect.objectContaining({
        username: 'newuser',
        password: 'hashed:password123'
      }))
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

    it('calls prepareSeason when no team available', async () => {
      const newTeam = testData.team({ id: 99, user_id: null, name: 'New Team' })

      query
        .mockResolvedValueOnce([{ amount: 0 }]) // username check
        .mockResolvedValueOnce([]) // no team available initially
        .mockResolvedValueOnce([newTeam]) // team available after prepareSeason
        .mockResolvedValueOnce({ insertId: 1 }) // insert user
        .mockResolvedValueOnce({}) // update team
        .mockResolvedValueOnce({}) // delete sponsor
        .mockResolvedValueOnce({}) // delete action cards

      prepareSeason.mockResolvedValue()
      addLogMessage.mockResolvedValue()
      getSponsor.mockResolvedValue({ sponsor: null })

      const req = { locale: 'en' }
      const result = await handlers.createAccount('newuser', 'password123', req)

      expect(result).toEqual({ success: true })
      expect(prepareSeason).toHaveBeenCalledTimes(1)
    })

    it('creates account with team from new league after prepareSeason', async () => {
      const newTeam = testData.team({ id: 50, user_id: null, name: 'Fresh Team' })

      query
        .mockResolvedValueOnce([{ amount: 0 }]) // username check
        .mockResolvedValueOnce([]) // no team available initially
        .mockResolvedValueOnce([newTeam]) // team available after prepareSeason
        .mockResolvedValueOnce({ insertId: 5 }) // insert user
        .mockResolvedValueOnce({}) // update team
        .mockResolvedValueOnce({}) // delete sponsor
        .mockResolvedValueOnce({}) // delete action cards

      prepareSeason.mockResolvedValue()
      addLogMessage.mockResolvedValue()
      getSponsor.mockResolvedValue({ sponsor: null })

      const req = { locale: 'en' }
      await handlers.createAccount('newuser', 'password123', req)

      // Verify the team from prepareSeason is used
      expect(addLogMessage).toHaveBeenCalledWith(
        expect.stringContaining('Fresh Team'),
        expect.objectContaining({ id: 50 }),
        null,
        null,
        'hand-peace-o',
        undefined,
        'info'
      )
    })

    it('throws error if still no team after prepareSeason', async () => {
      query
        .mockResolvedValueOnce([{ amount: 0 }]) // username check
        .mockResolvedValueOnce([]) // no team available initially
        .mockResolvedValueOnce([]) // still no team after prepareSeason

      prepareSeason.mockResolvedValue()

      const req = { locale: 'en' }
      await expect(handlers.createAccount('newuser', 'password123', req))
        .rejects.toMatchObject({ message: 'No team available.' })

      expect(prepareSeason).toHaveBeenCalledTimes(1)
    })

    it('accepts a valid email and sends a verification mail', async () => {
      const team = testData.team({ user_id: null })
      query
        .mockResolvedValueOnce([]) // emailIsTakenByAnotherUser check
        .mockResolvedValueOnce([{ amount: 0 }]) // username check
        .mockResolvedValueOnce([team]) // get available team
        .mockResolvedValueOnce({ insertId: 1 }) // insert user

      addLogMessage.mockResolvedValue()
      getSponsor.mockResolvedValue({ sponsor: null })
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
})
