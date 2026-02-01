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

// Import after mocking
import { query } from '../../lib/database.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import { getSponsor } from '../../helper/sponsorHelper.js'
import handlers from '../../routes/auth.js'

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('login', () => {
    it('returns token for valid credentials', async () => {
      const user = testData.user({ password: 'password123' })
      query.mockResolvedValue([user])

      const result = await handlers.login('testuser', 'password123')

      expect(result).toHaveProperty('token')
      expect(typeof result.token).toBe('string')
      expect(query).toHaveBeenCalledWith('SELECT * FROM user WHERE username=?', ['testuser'])
    })

    it('throws BadRequestError for non-string username', async () => {
      await expect(handlers.login(123, 'password'))
        .rejects.toMatchObject({ message: 'Username needs to be string' })
    })

    it('throws BadRequestError for non-string password', async () => {
      await expect(handlers.login('testuser', 123))
        .rejects.toMatchObject({ message: 'Password needs to be string' })
    })

    it('throws UnauthorizedError for wrong password', async () => {
      const user = testData.user({ password: 'correctpassword' })
      query.mockResolvedValue([user])

      await expect(handlers.login('testuser', 'wrongpassword'))
        .rejects.toMatchObject({ message: 'Wrong credentials' })
    })

    it('throws UnauthorizedError for non-existent user', async () => {
      query.mockResolvedValue([])

      await expect(handlers.login('nonexistent', 'password'))
        .rejects.toMatchObject({ message: 'Wrong credentials' })
    })
  })

  describe('createAccount', () => {
    it('creates account successfully', async () => {
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

      const result = await handlers.createAccount('newuser', 'password123', 'My Team')

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('SELECT COUNT(*) AS amount FROM user WHERE username=?', 'newuser')
    })

    it('throws BadRequestError for non-string username', async () => {
      await expect(handlers.createAccount(123, 'password123', 'Team'))
        .rejects.toMatchObject({ message: 'Username needs to be string' })
    })

    it('throws BadRequestError for short password', async () => {
      await expect(handlers.createAccount('user', 'short', 'Team'))
        .rejects.toMatchObject({ message: 'Password needs to be string longer then 8 character' })
    })

    it('throws BadRequestError for taken username', async () => {
      query.mockResolvedValueOnce([{ amount: 1 }])

      await expect(handlers.createAccount('existinguser', 'password123', 'Team'))
        .rejects.toMatchObject({ message: 'Username already taken' })
    })

    it('throws BadRequestError when no team available', async () => {
      query
        .mockResolvedValueOnce([{ amount: 0 }])
        .mockResolvedValueOnce([]) // no team available

      await expect(handlers.createAccount('newuser', 'password123', 'Team'))
        .rejects.toMatchObject({ message: 'No team available.' })
    })
  })
})
