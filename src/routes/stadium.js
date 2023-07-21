import { calcuateStadiumBuild, getStadiumOfCurrentUser } from '../helper/stadiumHelper.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { query } from '../lib/database.js'

export default {

  async getStadium (req) {
    return { stadium: await getStadiumOfCurrentUser(req) }
  },

  // one seat costs 10 €
  // level up cost, small to mid = 1mio, mid to big = 10mio
  async calculateStadiumPrice (req) {
    const plannedStadium = req.body.stadium
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== plannedStadium.id) throw new UnauthorizedError('Not your stadium dude')
    return { totalPrice: calcuateStadiumBuild(currentStadium, plannedStadium) }
  },

  async buildStadium (req) {
    const plannedStadium = req.body.stadium
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== plannedStadium.id) throw new UnauthorizedError('Not your stadium dude')
    const price = calcuateStadiumBuild(currentStadium, plannedStadium)
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    if (team.balance < price) throw new BadRequestError('Not enough money...')
    team.balance -= price
    await query('UPDATE team SET balance=? WHERE id=?', [team.balance, team.id])
    await query(`
        UPDATE stadium SET north_stand_size=?, 
                           south_stand_size=?, 
                           west_stand_size=?, 
                           east_stand_size=?,
                           north_stand_roof=?,
                           south_stand_roof=?,
                           west_stand_roof=?,
                           east_stand_roof=? WHERE id=?
    `, [
      plannedStadium.north_stand_size,
      plannedStadium.south_stand_size,
      plannedStadium.west_stand_size,
      plannedStadium.east_stand_size,
      plannedStadium.north_stand_roof,
      plannedStadium.south_stand_roof,
      plannedStadium.west_stand_roof,
      plannedStadium.east_stand_roof,
      plannedStadium.id
    ])
    return { success: true }
  },

  async updatePrices (req) {
    const plannedStadium = req.body.stadium
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== plannedStadium.id) throw new UnauthorizedError('Not your stadium dude')
    const stands = ['north', 'south', 'east', 'west']
    for (const stand of stands) {
      const val = plannedStadium[stand + '_stand_price']
      if (!Number.isInteger(val) || val <= 0) throw new BadRequestError('Price needs to be a integer number greater than 0.')
    }
    await query(`UPDATE stadium 
        SET ${stands.map(n => n + '_stand_price=?').join(', ')} 
        WHERE id=?`, stands.map(n => plannedStadium[n + '_stand_price']).concat([plannedStadium.id]))
    console.log('Updated stadium prices')
    return { success: true }
  }
}
