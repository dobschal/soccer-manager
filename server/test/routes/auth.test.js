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

// Import after mocking
import { query } from '../../lib/database.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import { getSponsor } from '../../helper/sponsorHelper.js'
import { prepareSeason } from '../../prepare-season.js'
import { hashPassword } from '../../lib/passwordHash.js'
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
  })
})
