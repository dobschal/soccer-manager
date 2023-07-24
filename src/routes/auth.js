import { config } from '../config.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { query } from '../lib/database.js'
import jwt from 'jsonwebtoken'

export default {

  /**
   * @param {import('express').Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async createAccount (req) {
    if (typeof req.body.username !== 'string') {
      throw new BadRequestError('Username needs to be string')
    }
    if (typeof req.body.password !== 'string' || req.body.password.length < 8) {
      throw new BadRequestError('Password needs to be string longer then 8 character')
    }
    const [{ amount }] = await query('SELECT COUNT(*) AS amount FROM user WHERE username=?', req.body.username)
    if (amount > 0) {
      throw new BadRequestError('Username already taken')
    }
    const [team] = await query('SELECT * FROM team WHERE user_id IS NULL ORDER BY level DESC LIMIT 1')
    if (!team) {
      throw new BadRequestError('No team available.')
    }
    //
    // TODO: Hash password
    //
    const { insertId: userId } = await query('INSERT INTO user SET ?', {
      ...req.body
    })
    await query(`UPDATE team SET user_id=${userId}, balance=500000 WHERE id=${team.id}`)
    return { success: true }
  },

  /**
   * @param {import('express').Request} req
   * @returns {Promise<{ token: string }>}
   */
  async login (req) {
    if (typeof req.body.username !== 'string') {
      throw new BadRequestError('Username needs to be string')
    }
    if (typeof req.body.password !== 'string') {
      throw new BadRequestError('Password needs to be string')
    }
    const [user] = await query('SELECT * FROM user WHERE username=?', [req.body.username])
    if (!user || user.password !== req.body.password) {
      throw new UnauthorizedError('Wrong credentials')
    }
    const token = jwt.sign({ sub: user.id }, config.SECRET)
    return { token }
  }

}
