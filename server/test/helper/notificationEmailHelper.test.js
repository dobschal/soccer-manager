import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('fs', () => {
  const existsSync = vi.fn()
  const createReadStream = vi.fn()
  return {
    default: { existsSync, createReadStream },
    existsSync,
    createReadStream
  }
})

import { serveNotificationEmailImage } from '../../helper/notificationEmailHelper.js'
import { query } from '../../lib/database.js'
import fs from 'fs'

function makeRes () {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status (code) { this.statusCode = code; return this },
    type (_t) { return this },
    send (body) { this.body = body; return this },
    setHeader (k, v) { this.headers[k] = v }
  }
}

describe('serveNotificationEmailImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fs.existsSync.mockReset()
    fs.createReadStream.mockReset()
  })

  it('404s when the token has an invalid format', async () => {
    const res = makeRes()
    await serveNotificationEmailImage({ params: { token: '../etc/passwd' } }, res)
    expect(res.statusCode).toBe(404)
    expect(query).not.toHaveBeenCalled()
  })

  it('404s when no notification row matches the token', async () => {
    query.mockResolvedValueOnce([])
    const res = makeRes()
    await serveNotificationEmailImage({ params: { token: 'abcd1234' } }, res)
    expect(res.statusCode).toBe(404)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('404s when the image file is missing from disk', async () => {
    query.mockResolvedValueOnce([{ id: 7, image_filename: 'missing.png' }])
    fs.existsSync.mockReturnValueOnce(false)
    const res = makeRes()
    await serveNotificationEmailImage({ params: { token: 'abcd1234' } }, res)
    expect(res.statusCode).toBe(404)
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE notification_email'),
      expect.anything()
    )
  })

  it('increments the open counter and streams the image with no-cache headers', async () => {
    query
      .mockResolvedValueOnce([{ id: 7, image_filename: 'banner.png' }])
      .mockResolvedValueOnce({ affectedRows: 1 })
    fs.existsSync.mockReturnValueOnce(true)
    const pipe = vi.fn()
    fs.createReadStream.mockReturnValueOnce({ pipe })

    const res = makeRes()
    await serveNotificationEmailImage({ params: { token: 'abcd1234' } }, res)

    expect(query).toHaveBeenNthCalledWith(
      2,
      'UPDATE notification_email SET open_count = open_count + 1 WHERE id=?',
      [7]
    )
    expect(res.headers['Content-Type']).toBe('image/png')
    expect(res.headers['Cache-Control']).toContain('no-store')
    expect(fs.createReadStream).toHaveBeenCalled()
    expect(pipe).toHaveBeenCalledWith(res)
  })

  it('still serves the image when incrementing the counter fails', async () => {
    query
      .mockResolvedValueOnce([{ id: 7, image_filename: 'banner.jpg' }])
      .mockRejectedValueOnce(new Error('DB down'))
    fs.existsSync.mockReturnValueOnce(true)
    const pipe = vi.fn()
    fs.createReadStream.mockReturnValueOnce({ pipe })

    const res = makeRes()
    await serveNotificationEmailImage({ params: { token: 'abcd1234' } }, res)

    expect(res.headers['Content-Type']).toBe('image/jpeg')
    expect(pipe).toHaveBeenCalledWith(res)
  })
})
