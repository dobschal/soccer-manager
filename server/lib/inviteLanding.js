import { query } from './database.js'
import { getGeoFromRequest } from './geoip.js'
import { recordLinkInvite } from '../helper/linkInviteHelper.js'

export const APP_STORE_URL = 'https://apps.apple.com/de/app/footballmanager-io/id6759547142'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=io.soccermanager.app'

/**
 * Decode the base64-encoded inviter username from the `i` query parameter.
 * Returns null for missing or malformed input.
 * @param {string|undefined} raw
 * @returns {string|null}
 */
export function decodeInviter (raw) {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8').trim()
    // Re-encoding must round-trip, otherwise the input wasn't valid base64.
    if (!decoded || Buffer.from(decoded, 'utf8').toString('base64') !== raw) return null
    return decoded
  } catch {
    return null
  }
}

/**
 * Classify the visitor's OS from the User-Agent header.
 * @param {string} ua
 * @returns {'ios'|'android'|'web'}
 */
export function detectOs (ua) {
  if (typeof ua !== 'string') return 'web'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'web'
}

/**
 * Public GET /invite handler. Remembers the inviter (by username) against the
 * visitor's IP, then routes the visitor to the right destination based on their
 * OS: the iOS App Store, the Android Play Store, or the web registration page.
 * The remembered invite is later claimed when the visitor registers from the
 * same IP (see claimLinkInviteForNewUser).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function serveInviteLanding (req, res) {
  const os = detectOs(req.headers['user-agent'])
  const username = decodeInviter(req.query.i)

  if (username) {
    try {
      const [inviter] = await query(
        'SELECT id FROM user WHERE username=? LIMIT 1',
        [username]
      )
      if (inviter) {
        const { ip } = getGeoFromRequest(req)
        await recordLinkInvite({ inviterUserId: inviter.id, ip })
      }
    } catch (e) {
      // Never let invite bookkeeping block the redirect — the visitor should
      // still land on the right page even if the DB write fails.
      console.error('[Invite] recordLinkInvite failed:', e)
    }
  }

  if (os === 'ios') return res.redirect(302, APP_STORE_URL)
  if (os === 'android') return res.redirect(302, PLAY_STORE_URL)
  // Web visitors land on the registration page (the landing page shows the
  // sign-up form by default when no `type=login` query is present). Redirect
  // relative so the visitor stays on whichever host they arrived through.
  return res.redirect(302, '/')
}
