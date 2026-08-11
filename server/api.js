// Side-effect import: load `.env` (when present) before any other module reads
// `process.env`. ES module imports execute in order, so this must come first.
import './lib/loadDotEnv.js'
import express from 'express'
import bodyParser from 'body-parser'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import http from 'http'
import { config } from './config.js'
import { runMigration } from './migrate-database.js'
import cron from 'node-cron'
import { prepareSeason } from './prepare-season.js'
import { calculateGames } from './play-game-day.js'
import { makeBotMoves } from './bot-move.js'
import { getLocaleFromRequest } from './i18n/index.js'
import { cleanupOldFreePlayers } from './helper/playerHelper.js'
import { cleanupIOCPlayers, fillMarketGaps, iocAutoAcceptBuyOffers, iocBuyFromUsers } from './helper/overseaClubHelper.js'
import { cleanupInactiveUsers } from './helper/teamHelper.js'
import { enforceSellOfferLimits } from './helper/tradeHelper.js'
import { cleanupOldClientLogs } from './helper/clientLogHelper.js'
import { cleanupOldLogMessages } from './helper/logMessageHelper.js'
import { collectStatistics } from './helper/statisticsHelper.js'
import { initWebSocket } from './lib/websocket.js'
import { getCachedUser } from './lib/userCache.js'
import { isSandboxHost } from './lib/sandboxHost.js'
import { serveNotificationEmailImage } from './helper/notificationEmailHelper.js'
import { serveInviteLanding } from './lib/inviteLanding.js'
import { registerDailyLogin, toDateKey } from './helper/loginStreakHelper.js'
import { advanceTours } from './helper/tourHelper.js'

const app = express()
const port = 3000

// Trust the first proxy (nginx) so req.ip uses X-Forwarded-For
app.set('trust proxy', 1)

// CORS: allow requests from native app (file:// or missing origin), the desktop
// app (custom app:// scheme), and localhost dev servers
app.use((req, res, next) => {
  const origin = req.headers.origin
  const isLocalhost = origin && /^https?:\/\/localhost(:\d+)?$/.test(origin)
  const isDesktopApp = origin && origin.startsWith('app://')
  if (!origin || origin === 'null' || origin === 'file://' || isLocalhost || isDesktopApp) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept-Language')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

// 20mb accommodates chat image uploads (up to 8MB raw ≈ 11MB base64-encoded).
app.use(bodyParser.json({ limit: '20mb' }))

// Hide the sandbox/test deployment from search engines: replace the static
// robots.txt with a "disallow everything" body and 404 the sitemap so Google
// does not index sandbox.footballmanager.io alongside the production site.
app.get('/robots.txt', (req, res, next) => {
  if (!isSandboxHost(req.hostname)) return next()
  res.type('text/plain').send('User-agent: *\nDisallow: /\n')
})
app.get('/sitemap.xml', (req, res, next) => {
  if (!isSandboxHost(req.hostname)) return next()
  res.status(404).type('text/plain').send('Not found')
})

app.use('/', express.static('client', { index: 'index.html' }))
app.use('/uploads', express.static('uploads', { maxAge: '30d' }))

// Public tracking endpoint for admin notification emails — serves the image
// by its public token and counts each load as an "open" of the email. Mounted
// before the auth middleware so unauthenticated email clients can fetch it.
app.get('/notification-image/:token', serveNotificationEmailImage)

// Public invite-link landing. Remembers the inviter (by IP) and routes the
// visitor to the App Store / Play Store / web registration based on their OS.
// Mounted before the auth middleware so anonymous visitors can be redirected.
app.get('/invite', serveInviteLanding)

/**
 * Check if the authorization header is available, if so validate the JWT and
 * load the user info based on the id from the database. The user is attached to
 * the request object. Also parse the locale from the request.
 */
app.use(async (req, res, next) => {
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization.substring(7)
      const { sub: userId, iat } = jwt.verify(token, config.SECRET)
      const user = await getCachedUser(userId)
      if (!user) return res.status(401).send({ error: 'Invalid authorization header!' })
      // Admin-revoked logins: any token minted before the cut-off is dead, so
      // blocking an account takes effect without waiting for the JWT to expire.
      if (user.sessions_invalid_before && (iat ?? 0) * 1000 < new Date(user.sessions_invalid_before).getTime()) {
        return res.status(401).send({ message: 'Session revoked!' })
      }
      req.user = user
      // Daily login streak (#501): the JWT never expires, so "logging in"
      // is really "using the app". Counted here, once per user per calendar
      // day, and deliberately not awaited so it never delays a response.
      void trackDailyLogin(user.id)
    } catch (e) {
      console.error('Cannot validate JWT: ', e)
      return res.status(401).send({ message: 'Invalid authorization header!' })
    }
  }
  req.locale = getLocaleFromRequest(req)
  next()
})

/** Users already counted today in this process — keyed by user id. */
const dailyLoginSeen = new Map()

/**
 * Register the user's daily login at most once per calendar day per process.
 * The helper is idempotent on its own; this map just keeps the vast majority
 * of requests from touching the database at all.
 * @param {number} userId
 * @returns {Promise<void>}
 */
async function trackDailyLogin (userId) {
  const today = toDateKey()
  if (dailyLoginSeen.get(userId) === today) return
  dailyLoginSeen.set(userId, today)
  try {
    await registerDailyLogin(userId)
  } catch (e) {
    dailyLoginSeen.delete(userId)
    console.error('trackDailyLogin failed:', e?.message ?? e)
  }
}

/**
 * Check the routes folder for all script and apply the route
 * handlers automatically
 */
const filenames = fs.readdirSync('server/routes').filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
for (const filename of filenames) {
  const mod = await import(`./routes/${filename}`)
  for (const fnName in mod.default) {
    if (Object.hasOwnProperty.call(mod.default, fnName)) {
      const fn = mod.default[fnName]
      app.post(`/api/${fnName}`, async (req, res) => {
        const t1 = Date.now()
        try {
          const params = req.body.params ?? []
          const response = await fn(...params, req)
          res.send({ response })
        } catch (e) {
          console.error('Error: ', e)
          res.status(e.status ?? 500).send({ message: e.message ?? 'Unknown error' })
        }
        const duration = Date.now() - t1
        if (duration > 100) {
          console.warn(`👉 Request️ ${fnName} took ${duration}ms`)
        }
      })
    }
  }
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - The async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialDelay - Initial delay in ms
 * @returns {Promise<any>}
 */
async function withRetry (fn, maxRetries = 5, initialDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) throw error
      const isRetryable = error.code === 'EAI_AGAIN' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND'
      if (!isRetryable) throw error
      const delay = initialDelay * Math.pow(2, attempt - 1)
      console.log(`Database connection failed (${error.code}), retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

/**
 * @returns {Promise<void>}
 */
async function start () {
  await withRetry(runMigration)
  cron.schedule('0 0 */12 * * *', async () => {
    //           * * * * * *
    //           | | | | | |
    //           | | | | | day of week
    //           | | | | month
    //           | | | day of month
    //           | | hour
    //           | minute
    //           second ( optional )
    console.log('Started CRON job for game day calculation and bot moves.')
    let newSeasonCreated = false
    try { newSeasonCreated = await prepareSeason() } catch (e) { console.error('prepareSeason failed:', e) }
    if (newSeasonCreated) {
      console.log('⏸️ New season created — skipping game calculation this tick.')
    } else {
      try { await calculateGames() } catch (e) { console.error('calculateGames failed:', e) }
    }
    try { await cleanupOldFreePlayers() } catch (e) { console.error('cleanupOldFreePlayers failed:', e) }
    try { await advanceTours() } catch (e) { console.error('advanceTours failed:', e) }
    try { await makeBotMoves() } catch (e) { console.error('makeBotMoves failed:', e) }
    try { await cleanupInactiveUsers() } catch (e) { console.error('cleanupInactiveUsers failed:', e) }
    try { await enforceSellOfferLimits() } catch (e) { console.error('enforceSellOfferLimits failed:', e) }
    try { await cleanupIOCPlayers() } catch (e) { console.error('cleanupIOCPlayers failed:', e) }
    try { await fillMarketGaps() } catch (e) { console.error('fillMarketGaps failed:', e) }
    try { await iocBuyFromUsers() } catch (e) { console.error('iocBuyFromUsers failed:', e) }
    try { await iocAutoAcceptBuyOffers() } catch (e) { console.error('iocAutoAcceptBuyOffers failed:', e) }
    try { await cleanupOldClientLogs() } catch (e) { console.error('cleanupOldClientLogs failed:', e) }
    try { await cleanupOldLogMessages() } catch (e) { console.error('cleanupOldLogMessages failed:', e) }
  })

  // Collect a daily snapshot of game-wide statistics every night at 03:00.
  cron.schedule('0 0 3 * * *', async () => {
    console.log('Started CRON job for nightly statistics collection.')
    try {
      const row = await collectStatistics()
      console.log(`📊 Statistics snapshot stored (id=${row.id}).`)
    } catch (e) {
      console.error('collectStatistics failed:', e)
    }
  })

  // Create HTTP server and attach WebSocket
  const server = http.createServer(app)
  initWebSocket(server)

  server.listen(port, () => {
    console.log(`🚀 App running on port ${port}`)
  })
}

start()
