import express from 'express'
import { query } from './lib/database.js'
import bodyParser from 'body-parser'
import { initAuthRoutes } from './routes/auth.js'
const app = express()
const port = 3000

app.use(bodyParser.json())
app.use('/', express.static('client', { index: 'index.html' }))

app.get('/api/read', async (req, res) => {
  //
  // TODO: Add fraud protection... only SELECT should be allowed...
  //
  const { query: q } = req.query
  const results = await query(q)
  res.send(results)
})

initAuthRoutes(app)

app.listen(port, () => {
  console.log(`API running on port ${port}`)
})
