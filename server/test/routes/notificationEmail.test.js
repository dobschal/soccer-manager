import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/email.js', () => ({
  sendNotificationEmail: vi.fn()
}))

vi.mock('../../config.js', () => ({
  config: { PUBLIC_URL: 'https://example.com' }
}))

vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    createReadStream: vi.fn()
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  createReadStream: vi.fn()
}))

import handlers from '../../routes/notificationEmail.js'
import { query } from '../../lib/database.js'
import { sendNotificationEmail } from '../../lib/email.js'

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

describe('notificationEmail routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendAdminNotificationEmail', () => {
    it('rejects non-admin users', async () => {
      await expect(
        handlers.sendAdminNotificationEmail('t', 'b', TINY_PNG, 'image/png', { user: { is_admin: 0 } })
      ).rejects.toMatchObject({ message: 'This action is only available for admins' })
    })

    it('rejects when title is missing', async () => {
      await expect(
        handlers.sendAdminNotificationEmail('', 'body', TINY_PNG, 'image/png', { user: { is_admin: 1, username: 'a' } })
      ).rejects.toMatchObject({ message: 'Title is required' })
    })

    it('rejects when body is missing', async () => {
      await expect(
        handlers.sendAdminNotificationEmail('title', '', TINY_PNG, 'image/png', { user: { is_admin: 1, username: 'a' } })
      ).rejects.toMatchObject({ message: 'Body text is required' })
    })

    it('rejects unsupported image types', async () => {
      await expect(
        handlers.sendAdminNotificationEmail('title', 'body', 'data:text/plain;base64,YQ==', 'text/plain', { user: { is_admin: 1, username: 'a' } })
      ).rejects.toMatchObject({ message: 'Invalid image type' })
    })

    it('inserts the email row, sends to every user with an email, and updates the recipient count', async () => {
      // 1) INSERT notification_email -> insertId
      // 2) SELECT users
      // 3) UPDATE recipient_count
      query
        .mockResolvedValueOnce({ insertId: 99 })
        .mockResolvedValueOnce([
          { id: 1, username: 'alice', email: 'alice@example.com', language: 'en' },
          { id: 2, username: 'bob', email: 'bob@example.com', language: 'de' }
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })

      sendNotificationEmail
        .mockResolvedValueOnce({ sent: true })
        .mockResolvedValueOnce({ sent: false })

      const result = await handlers.sendAdminNotificationEmail(
        'Hello',
        'Body text',
        TINY_PNG,
        'image/png',
        { user: { is_admin: 1, username: 'admin' } }
      )

      expect(query).toHaveBeenNthCalledWith(
        1,
        'INSERT INTO notification_email SET ?',
        expect.objectContaining({
          title: 'Hello',
          body_text: 'Body text',
          image_filename: expect.stringMatching(/\.png$/),
          image_token: expect.stringMatching(/^[a-f0-9]{48}$/),
          recipient_count: 0,
          open_count: 0
        })
      )
      expect(sendNotificationEmail).toHaveBeenCalledTimes(2)
      expect(sendNotificationEmail).toHaveBeenNthCalledWith(1, expect.objectContaining({
        toEmail: 'alice@example.com',
        locale: 'en',
        username: 'alice',
        title: 'Hello',
        bodyText: 'Body text',
        imageUrl: expect.stringMatching(/^https:\/\/example\.com\/notification-image\/[a-f0-9]{48}$/)
      }))
      expect(sendNotificationEmail).toHaveBeenNthCalledWith(2, expect.objectContaining({
        toEmail: 'bob@example.com',
        locale: 'de'
      }))
      expect(query).toHaveBeenLastCalledWith(
        'UPDATE notification_email SET recipient_count=? WHERE id=?',
        [2, 99]
      )
      expect(result).toEqual({ sent: 1, recipients: 2 })
    })

    it('still updates recipient count when an individual email fails', async () => {
      query
        .mockResolvedValueOnce({ insertId: 11 })
        .mockResolvedValueOnce([
          { id: 1, username: 'alice', email: 'alice@example.com', language: 'en' }
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })

      sendNotificationEmail.mockRejectedValueOnce(new Error('SMTP down'))

      const result = await handlers.sendAdminNotificationEmail(
        'Hello',
        'Body',
        TINY_PNG,
        'image/png',
        { user: { is_admin: 1, username: 'admin' } }
      )

      expect(result).toEqual({ sent: 0, recipients: 1 })
    })
  })

  describe('getNotificationEmails', () => {
    it('rejects non-admin users', async () => {
      await expect(handlers.getNotificationEmails({ user: { is_admin: 0 } }))
        .rejects.toMatchObject({ message: 'This action is only available for admins' })
    })

    it('returns rows with image URL built from the public token', async () => {
      query.mockResolvedValueOnce([
        {
          id: 1,
          title: 'First',
          image_token: 'aabb',
          recipient_count: 5,
          open_count: 2,
          created_at: '2026-06-03T10:00:00.000Z'
        },
        {
          id: 2,
          title: 'Second',
          image_token: 'ccdd',
          recipient_count: 10,
          open_count: 0,
          created_at: '2026-06-02T10:00:00.000Z'
        }
      ])

      const result = await handlers.getNotificationEmails({ user: { is_admin: 1 } })
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0]).toEqual({
        id: 1,
        title: 'First',
        recipient_count: 5,
        open_count: 2,
        created_at: '2026-06-03T10:00:00.000Z',
        image_url: 'https://example.com/notification-image/aabb'
      })
      expect(result.rows[1].image_url).toBe('https://example.com/notification-image/ccdd')
    })
  })
})
