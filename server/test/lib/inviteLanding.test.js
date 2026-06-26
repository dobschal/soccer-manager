import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/geoip.js', () => ({
  getGeoFromRequest: vi.fn().mockReturnValue({ ip: '1.2.3.4', country: 'DE', region: null })
}))

vi.mock('../../helper/linkInviteHelper.js', () => ({
  recordLinkInvite: vi.fn().mockResolvedValue({ recorded: true })
}))

import {
  decodeInviter,
  detectOs,
  serveInviteLanding,
  APP_STORE_URL,
  PLAY_STORE_URL
} from '../../lib/inviteLanding.js'
import { query } from '../../lib/database.js'
import { recordLinkInvite } from '../../helper/linkInviteHelper.js'

function makeRes () {
  return {
    redirectCode: null,
    redirectUrl: null,
    redirect (code, url) {
      this.redirectCode = code
      this.redirectUrl = url
    }
  }
}

describe('inviteLanding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('decodeInviter', () => {
    it('decodes a valid base64 username', () => {
      // "Emmo" -> "RW1tbw==" (matches the ticket example)
      expect(decodeInviter('RW1tbw==')).toBe('Emmo')
    })

    it('returns null for missing or malformed input', () => {
      expect(decodeInviter(undefined)).toBe(null)
      expect(decodeInviter('')).toBe(null)
      expect(decodeInviter('not valid base64!!')).toBe(null)
    })
  })

  describe('detectOs', () => {
    it('detects iOS', () => {
      expect(detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios')
      expect(detectOs('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('ios')
    })

    it('detects Android', () => {
      expect(detectOs('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android')
    })

    it('defaults to web', () => {
      expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('web')
      expect(detectOs(undefined)).toBe('web')
    })
  })

  describe('serveInviteLanding', () => {
    it('records the invite and redirects iOS visitors to the App Store', async () => {
      query.mockResolvedValueOnce([{ id: 7 }]) // inviter lookup
      const req = { headers: { 'user-agent': 'iPhone' }, query: { i: 'RW1tbw==' } }
      const res = makeRes()

      await serveInviteLanding(req, res)

      expect(query).toHaveBeenCalledWith('SELECT id FROM user WHERE username=? LIMIT 1', ['Emmo'])
      expect(recordLinkInvite).toHaveBeenCalledWith({ inviterUserId: 7, ip: '1.2.3.4' })
      expect(res.redirectCode).toBe(302)
      expect(res.redirectUrl).toBe(APP_STORE_URL)
    })

    it('redirects Android visitors to the Play Store', async () => {
      query.mockResolvedValueOnce([{ id: 7 }])
      const req = { headers: { 'user-agent': 'Android' }, query: { i: 'RW1tbw==' } }
      const res = makeRes()

      await serveInviteLanding(req, res)

      expect(res.redirectUrl).toBe(PLAY_STORE_URL)
    })

    it('redirects web visitors to the registration page', async () => {
      query.mockResolvedValueOnce([{ id: 7 }])
      const req = { headers: { 'user-agent': 'Windows' }, query: { i: 'RW1tbw==' } }
      const res = makeRes()

      await serveInviteLanding(req, res)

      expect(res.redirectUrl).toBe('/')
    })

    it('still redirects when the inviter username is missing or unknown', async () => {
      const req = { headers: { 'user-agent': 'Windows' }, query: {} }
      const res = makeRes()

      await serveInviteLanding(req, res)

      expect(recordLinkInvite).not.toHaveBeenCalled()
      expect(res.redirectUrl).toBe('/')
    })

    it('does not record when the inviter does not exist', async () => {
      query.mockResolvedValueOnce([]) // no such user
      const req = { headers: { 'user-agent': 'iPhone' }, query: { i: 'RW1tbw==' } }
      const res = makeRes()

      await serveInviteLanding(req, res)

      expect(recordLinkInvite).not.toHaveBeenCalled()
      expect(res.redirectUrl).toBe(APP_STORE_URL)
    })

    it('redirects even when the DB lookup throws', async () => {
      query.mockRejectedValueOnce(new Error('db down'))
      const req = { headers: { 'user-agent': 'Android' }, query: { i: 'RW1tbw==' } }
      const res = makeRes()

      await serveInviteLanding(req, res)

      expect(res.redirectUrl).toBe(PLAY_STORE_URL)
    })
  })
})
