import { config } from '../config.js'
import { query } from '../lib/database.js'
import jwt from 'jsonwebtoken'

export function initAuthRoutes (app) {
  app.post('/api/createAccount', async (req, res) => {
    if (typeof req.body.username !== 'string') return res.status(400).send({ error: 'Username needs to be string' })
    if (typeof req.body.password !== 'string' || req.body.password.length < 8) return res.status(400).send({ error: 'Password needs to be string longer then 8 character' })
    const [{ amount }] = await query('SELECT COUNT(*) AS amount FROM user WHERE username=?', req.body.username)
    if (amount > 0) {
      return res.status(400).send({ error: 'Username already taken' })
    }
    const [team] = await query('SELECT * FROM team WHERE user_id IS NULL ORDER BY level DESC LIMIT 1')
    if (!team) {
      return res.status(409).send({ error: 'No team available.' })
    }
    //
    // TODO: Hash password
    //
    const { insertId: userId } = await query('INSERT INTO user SET ?', {
      ...req.body
    })
    await query(`UPDATE team SET user_id=${userId} WHERE id=${team.id}`)
    res.send({ success: true })
  })

  app.post('/api/login', async (req, res) => {
    if (typeof req.body.username !== 'string') return res.status(400).send({ error: 'Username needs to be string' })
    if (typeof req.body.password !== 'string') return res.status(400).send({ error: 'Password needs to be string longer then 8 character' })
    const [user] = await query('SELECT * FROM user WHERE username=?', [req.body.username])
    if (!user || user.password !== req.body.password) return res.status(403).send({ error: 'Wrong credentials' })
    const token = jwt.sign({ sub: user.id }, config.SECRET)
    res.send({ token })
  })
}
