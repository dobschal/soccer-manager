import express from 'express'
import { query } from './lib/database.js'
const app = express()
const port = 3000

app.get('/api/read', async (req, res) => {
  //
  // TODO: Add fraud protection..
  //
  const { query: q } = req.query
  const results = await query(q)
  res.send(results)
})

app.use('/', express.static('client', { index: 'index.html' }))

app.listen(port, () => {
  console.log(`API running on port ${port}`)
})
