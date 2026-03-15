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
import { cleanupIOCPlayers, fillMarketGaps, iocAutoAcceptBuyOffers, iocBuyUndervaluedPlayers, iocEnsureMinimumTransfers } from './helper/overseaClubHelper.js'
import { cleanupInactiveUsers } from './helper/teamHelper.js'
import { cleanupOldClientLogs } from './helper/clientLogHelper.js'
import { cleanupOldLogMessages } from './helper/logMessageHelper.js'
import { initWebSocket } from './lib/websocket.js'
import { getCachedUser } from './lib/userCache.js'

const app = express()
const port = 3000

// Trust the first proxy (nginx) so req.ip uses X-Forwarded-For
app.set('trust proxy', 1)

// CORS: allow requests from native app (file:// or missing origin) and localhost dev servers
app.use((req, res, next) => {
  const origin = req.headers.origin
  const isLocalhost = origin && /^https?:\/\/localhost(:\d+)?$/.test(origin)
  if (!origin || origin === 'null' || origin === 'file://' || isLocalhost) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept-Language')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

app.use(bodyParser.json())
app.use('/', express.static('client', { index: 'index.html' }))

/**
 * Check if the authorization header is available, if so validate the JWT and
 * load the user info based on the id from the database. The user is attached to
 * the request object. Also parse the locale from the request.
 */
app.use(async (req, res, next) => {
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization.substring(7)
      const { sub: userId } = jwt.verify(token, config.SECRET)
      const user = await getCachedUser(userId)
      if (!user) return res.status(401).send({ error: 'Invalid authorization header!' })
      req.user = user
    } catch (e) {
      console.error('Cannot validate JWT: ', e)
      return res.status(401).send({ message: 'Invalid authorization header!' })
    }
  }
  req.locale = getLocaleFromRequest(req)
  next()
})

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
  await prepareSeason()
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
    try { await prepareSeason() } catch (e) { console.error('prepareSeason failed:', e) }
    try { await calculateGames() } catch (e) { console.error('calculateGames failed:', e) }
    try { await makeBotMoves() } catch (e) { console.error('makeBotMoves failed:', e) }
    try { await cleanupInactiveUsers() } catch (e) { console.error('cleanupInactiveUsers failed:', e) }
    try { await cleanupOldFreePlayers() } catch (e) { console.error('cleanupOldFreePlayers failed:', e) }
    try { await cleanupIOCPlayers() } catch (e) { console.error('cleanupIOCPlayers failed:', e) }
    try { await fillMarketGaps() } catch (e) { console.error('fillMarketGaps failed:', e) }
    try { await iocBuyUndervaluedPlayers() } catch (e) { console.error('iocBuyUndervaluedPlayers failed:', e) }
    try { await iocEnsureMinimumTransfers() } catch (e) { console.error('iocEnsureMinimumTransfers failed:', e) }
    try { await iocAutoAcceptBuyOffers() } catch (e) { console.error('iocAutoAcceptBuyOffers failed:', e) }
    try { await cleanupOldClientLogs() } catch (e) { console.error('cleanupOldClientLogs failed:', e) }
    try { await cleanupOldLogMessages() } catch (e) { console.error('cleanupOldLogMessages failed:', e) }
  })

  // Create HTTP server and attach WebSocket
  const server = http.createServer(app)
  initWebSocket(server)

  server.listen(port, () => {
    console.log(`🚀 App running on port ${port}`)
  })
}

start()
