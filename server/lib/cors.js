/**
 * Request headers a cross-origin client is allowed to send.
 *
 * The native app (iOS/Android WebView) and the desktop app load their HTML from
 * a local bundle, so every API call is cross-origin and goes through a CORS
 * preflight — unlike the web app, which is same-origin and never preflights.
 * A header the client sends but this list omits makes the WebView block the
 * request *before it leaves the device*. The client sees a rejected `fetch`,
 * indistinguishable from a dead network, so the failure surfaces as a bogus
 * "no internet connection" screen while the server looks perfectly healthy.
 *
 * Keep this in sync with the headers set in `client/lib/gateway.js`;
 * `server/test/lib/cors.test.js` fails if the two drift apart.
 */
export const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'Accept-Language',
  'X-Client-Id'
]

/**
 * Origins allowed to talk to the API: the native app (which sends no origin, a
 * literal `null`, or `file://`), the desktop app (custom `app://` scheme), and
 * localhost dev servers.
 *
 * @param {string|undefined} origin
 * @returns {boolean}
 */
export function isAllowedOrigin (origin) {
  if (!origin || origin === 'null' || origin === 'file://') return true
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true
  return origin.startsWith('app://')
}

/**
 * Express middleware that answers CORS preflights and tags allowed responses.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function corsMiddleware (req, res, next) {
  const origin = req.headers.origin
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '))
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
}
