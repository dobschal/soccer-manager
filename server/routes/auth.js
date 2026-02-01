import { config } from '../config.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { query } from '../lib/database.js'
import jwt from 'jsonwebtoken'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getSponsor } from '../helper/sponsorHelper.js'

export default {

  /**
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{success: boolean}>}
   */
  async createAccount (username, password) {
    if (typeof username !== 'string') {
      throw new BadRequestError('Username needs to be string')
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new BadRequestError('Password needs to be string longer then 8 character')
    }
    const [{ amount }] = await query('SELECT COUNT(*) AS amount FROM user WHERE username=?', username)
    if (amount > 0) {
      throw new BadRequestError('Username already taken')
    }
    const [team] = await query('SELECT * FROM team WHERE user_id IS NULL ORDER BY level DESC LIMIT 1')
    if (!team) {
      throw new BadRequestError('No team available.')
    }
    const { insertId: userId } = await query('INSERT INTO user SET ?', {
      username,
      password
    })
    await addLogMessage(`Hey  ${username}! The president of ${team.name} is sending you a warm welcome!`, team)
    await query(`UPDATE team SET user_id=${userId}, balance=500000 WHERE id=${team.id}`)
    const { sponsor } = await getSponsor(team)
    if (sponsor) {
      await query('DELETE FROM sponsor WHERE id=?', [sponsor.id])
    }
    await query('DELETE FROM action_card WHERE team_id=?', [team.id])
    return { success: true }
  },

  /**
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{ token: string }>}
   */
  async login (username, password) {
    if (typeof username !== 'string') {
      throw new BadRequestError('Username needs to be string')
    }
    if (typeof password !== 'string') {
      throw new BadRequestError('Password needs to be string')
    }
    const [user] = await query('SELECT * FROM user WHERE username=?', [username])
    if (!user || user.password !== password) {
      throw new UnauthorizedError('Wrong credentials')
    }
    const token = jwt.sign({ sub: user.id }, config.SECRET)
    return { token }
  }

}
