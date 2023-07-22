import express from 'express'
import bodyParser from 'body-parser'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { query } from './lib/database.js'
import { runMigration } from './migrate-database.js'
import cron from 'node-cron'
import { prepareSeason } from './prepare-season.js'
import { calculateGames } from './play-game-day.js'

const app = express()
const port = 3000

app.use(bodyParser.json())
app.use('/', express.static('client', { index: 'index.html' }))

/**
 * Check if the authorization header is available, if so validate the JWT and
 * load the user info based on the id from the database. The user is attached to
 * the request object.
 */
app.use(async (req, res, next) => {
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization.substring(7)
      const { sub: userId } = jwt.verify(token, config.SECRET)
      const [user] = await query('SELECT * FROM user WHERE id=? LIMIT 1', [userId])
      if (!user) return res.status(401).send({ error: 'Invalid authorization header!' })
      req.user = user
    } catch (e) {
      console.error('Cannot validate JWT: ', e)
      return res.status(401).send({ message: 'Invalid authorization header!' })
    }
  }
  next()
})

/**
 * Check the routes folder for all script and apply the route
 * handlers automatically
 */
const filenames = fs.readdirSync('src/routes')
for (const filename of filenames) {
  const mod = await import(`./routes/${filename}`)
  for (const fnName in mod.default) {
    if (Object.hasOwnProperty.call(mod.default, fnName)) {
      const fn = mod.default[fnName]
      app.post(`/api/${fnName}`, async (req, res) => {
        const t1 = Date.now()
        try {
          const response = await fn(req, res)
          if (typeof response !== 'undefined') {
            res.send(response)
          }
        } catch (e) {
          console.error('Error: ', e)
          res.status(e.status ?? 500).send({ message: e.message ?? 'Unknown error' })
        }
        console.log(`${fnName} took ${Date.now() - t1}ms`)
      })
    }
  }
}

/**
 * On every startup, we update the database we the latest structure
 * Schedule the game day calculation and season preparation
 * Start API server to listen on post 3000
 */
async function start () {
  await runMigration()
  await prepareSeason()
  cron.schedule('0 0 * * * *', async () => {
    //           * * * * * *
    //           | | | | | |
    //           | | | | | day of week
    //           | | | | month
    //           | | | day of month
    //           | | hour
    //           | minute
    //           second ( optional )
    console.log('Start CRON job for game day calculation.')
    await prepareSeason()
    await calculateGames()
  })
  app.listen(port, () => {
    console.log(`🚀 App running on port ${port}`)
  })
}

start()
