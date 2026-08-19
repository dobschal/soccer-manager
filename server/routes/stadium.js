import {
  buildStadium,
  calcuateStadiumBuild,
  getStadiumOfCurrentUser,
  getConstructionInfo,
  isStandUnderConstruction,
  calculateConstructionTime
} from '../helper/stadiumHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { query } from '../lib/database.js'
import { t } from '../i18n/index.js'
import { charLength } from '../lib/util.js'

/**
 * How many past home games the attendance table can page through.
 * @type {number}
 */
const ATTENDANCE_GAME_LIMIT = 60

/**
 * The extracted `stadiumDetails` arrives as a JSON string (or NULL for games
 * whose details never got one, e.g. forfeits). Objects are accepted too so a
 * driver that pre-parses JSON columns keeps working.
 * @param {object|string|null} value
 * @returns {object}
 */
function _parseStadiumDetails (value) {
  if (!value) return {}
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) || {}
  } catch {
    return {}
  }
}

/**
 * Number of cup rounds per season, used by the client to name a round
 * ("Final", "Semi-Final", …) from its `cup_round` bracket size.
 * @param {Array<number>} seasons
 * @returns {Promise<Object<number, number>>}
 */
async function _getTotalCupRoundsBySeason (seasons) {
  if (seasons.length === 0) return {}
  const rows = await query(
    `SELECT season, MAX(cup_round) as maxRound
     FROM game
     WHERE game_type = 'cup' AND season IN (${seasons.map(() => '?').join(',')})
     GROUP BY season`,
    seasons
  )
  const bySeason = {}
  for (const row of rows) {
    bySeason[row.season] = row.maxRound ? Math.log2(row.maxRound) + 1 : 0
  }
  return bySeason
}

export default {

  /**
   * @param {number} teamId
   * @returns {Promise<StadiumType>}
   */
  async getStadiumByTeamId (teamId) {
    const stadiums = await query('SELECT * FROM stadium WHERE team_id=? LIMIT 1', [teamId])
    return stadiums[0]
  },

  /**
   * @param {Request} req
   * @returns {Promise<{stadium: StadiumType, constructionInfo: Object}>}
   */
  async getStadium (req) {
    const stadium = await getStadiumOfCurrentUser(req)
    const { gameDay, season } = await getGameDayAndSeason()
    const constructionInfo = await getConstructionInfo(stadium, gameDay, season)
    return { stadium, constructionInfo }
  },

  /**
   * @param {StadiumType} stadium
   * @param {Request} req
   * @returns {Promise<{totalPrice: number, constructionTimes: Object}>}
   */
  async calculateStadiumPrice (stadium, req) {
    const locale = req.locale || 'en'
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== stadium.id) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))

    const stands = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
    const constructionTimes = {}

    for (const stand of stands) {
      const currentSize = currentStadium[`${stand}_stand_size`]
      const targetSize = stadium[`${stand}_stand_size`]
      const currentRoof = currentStadium[`${stand}_stand_roof`]
      const targetRoof = stadium[`${stand}_stand_roof`]

      if (currentSize !== targetSize || currentRoof !== targetRoof) {
        if (isStandUnderConstruction(currentStadium, stand)) {
          constructionTimes[stand] = {
            blocked: true,
            message: t('error.standUnderConstruction', {}, locale)
          }
        } else {
          constructionTimes[stand] = {
            days: calculateConstructionTime(currentSize, targetSize, currentRoof, targetRoof),
            seatsDiff: targetSize - currentSize,
            addingRoof: Boolean(!currentRoof && targetRoof),
            // The stand grows and keeps its roof: the cover gets extended.
            extendingRoof: Boolean(currentRoof && targetRoof && targetSize > currentSize),
            removingRoof: Boolean(currentRoof && !targetRoof)
          }
        }
      }
    }

    return {
      totalPrice: calcuateStadiumBuild(currentStadium, stadium),
      constructionTimes
    }
  },

  /**
   * @param {StadiumType} stadium
   * @param {Request} req
   * @returns {Promise<{success: boolean, constructionInfo: Object}>}
   */
  async buildStadium (stadium, req) {
    const locale = req.locale || 'en'
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== stadium.id) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))

    // Validate no stands being expanded are under construction
    const stands = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
    for (const stand of stands) {
      const hasChanges = currentStadium[`${stand}_stand_size`] !== stadium[`${stand}_stand_size`] ||
                         currentStadium[`${stand}_stand_roof`] !== stadium[`${stand}_stand_roof`]

      if (hasChanges && isStandUnderConstruction(currentStadium, stand)) {
        throw new BadRequestError(t('error.standUnderConstruction', {}, locale))
      }
    }

    const price = calcuateStadiumBuild(currentStadium, stadium)
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    if (team.balance < price) throw new BadRequestError(t('error.notEnoughMoney', {}, locale))
    const result = await buildStadium(team, currentStadium, stadium, price)
    return { success: true, constructionInfo: result.constructionInfo }
  },

  /**
   * Attendance of the user's last home games — league, cup and friendly alike.
   * The client filters and paginates locally, so the whole (bounded) window is
   * returned at once.
   *
   * `game.details` is a ~65 KB LONGTEXT blob per game; pulling the full window
   * of them just to read the stand attendance would move megabytes on every
   * page load, so the JSON is narrowed down to `stadiumDetails` inside MySQL.
   * Picking the window in a derived table first keeps that narrowing off every
   * older home game as well — sorting the full history with the blob attached
   * costs ~1.5s for a long-lived team, the derived table ~0.1s.
   *
   * Cup byes (`team_2_id IS NULL`) are no home games and drop out.
   *
   * Sorted by `created_at`, which `play-game-day.js` and the friendly route set
   * to the moment the game was actually played — not by `game_day`. A friendly
   * is played at an arbitrary time *inside* a game day while the league/cup
   * game for that same day runs at the cron boundary, so `game_day` ties the
   * two and orders them by insert id, which put friendlies above league games
   * they were played before.
   *
   * @param {Request} req
   * @returns {Promise<{attendance: Array}>}
   */
  async getStadiumAttendance (req) {
    const stadium = await getStadiumOfCurrentUser(req)
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const games = await query(`
        SELECT g.id        as gameId,
               g.season    as season,
               g.game_day  as gameDay,
               g.match_day as matchDay,
               g.cup_round as cupRound,
               g.game_type as gameType,
               CAST(JSON_EXTRACT(IF(JSON_VALID(g.details), g.details, '{}'), '$.stadiumDetails') AS CHAR) as stadiumDetails,
               t.id         as opponentId,
               t.name       as opponentName,
               t.short_name as opponentShortName,
               t.emblem     as opponentEmblem,
               t.color      as opponentColor
        FROM (SELECT id, created_at
              FROM game
              WHERE team_1_id = ?
                AND played = 1
                AND team_2_id IS NOT NULL
              ORDER BY created_at DESC, id DESC
              LIMIT ${ATTENDANCE_GAME_LIMIT}) sel
                 JOIN game g ON g.id = sel.id
                 JOIN team t ON t.id = g.team_2_id
        ORDER BY sel.created_at DESC, sel.id DESC
    `, [team.id])

    const totalCupRoundsBySeason = await _getTotalCupRoundsBySeason(
      [...new Set(games.filter(g => g.gameType === 'cup').map(g => g.season))]
    )

    const stands = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
    const attendance = games.map(game => {
      const sd = _parseStadiumDetails(game.stadiumDetails)
      const row = {
        gameId: game.gameId,
        season: game.season,
        gameDay: game.gameDay,
        gameType: game.gameType || 'league',
        matchDay: game.matchDay,
        cupRound: game.cupRound,
        totalCupRounds: totalCupRoundsBySeason[game.season] ?? 0,
        opponent: {
          id: game.opponentId,
          name: game.opponentName,
          short_name: game.opponentShortName,
          emblem: game.opponentEmblem,
          color: game.opponentColor
        },
        stands: {}
      }
      for (const stand of stands) {
        const guests = sd[stand + 'Guests'] || 0
        // A game records the stand size it was played with, so finishing an
        // expansion no longer rewrites the fill rate of every older game.
        // Games from before that fall back to today's size, which can only be
        // larger (stands cannot shrink) — hence the cap at 100%.
        const recordedSize = sd[stand + 'Size']
        const size = (recordedSize ?? stadium[stand + '_stand_size']) || 0
        const underConstruction = Boolean(sd[stand + 'UnderConstruction'])
        // A stand under construction is closed, not empty. Reporting 0% would
        // read as "nobody came" next to the open stands.
        const percentage = (underConstruction || size <= 0)
          ? 0
          : Math.min(100, Math.round((guests / size) * 100))
        row.stands[stand] = { guests, size, percentage, underConstruction }
      }
      return row
    })

    return { attendance }
  },

  /**
   * @param {Request} req
   * @returns {Promise<{history: Array}>}
   */
  async getConstructionHistory (req) {
    const stadium = await getStadiumOfCurrentUser(req)
    const history = await query(
      'SELECT * FROM stadium_construction_history WHERE stadium_id=? ORDER BY created_at DESC',
      [stadium.id]
    )
    return { history }
  },

  /**
   * @param {string} name
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateStadiumName (name, req) {
    const locale = req.locale || 'en'
    if (typeof name !== 'string') {
      throw new BadRequestError(t('error.invalidStadiumName', {}, locale))
    }
    const trimmed = name.trim()
    if (trimmed.length === 0 || charLength(trimmed) > 100) {
      throw new BadRequestError(t('error.invalidStadiumName', {}, locale))
    }
    const stadium = await getStadiumOfCurrentUser(req)
    await query('UPDATE stadium SET name=? WHERE id=?', [trimmed, stadium.id])
    return { success: true }
  },

  /**
   * @param {StadiumType} stadium
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updatePrices (stadium, req) {
    const locale = req.locale || 'en'
    const currentStadium = await getStadiumOfCurrentUser(req)
    if (currentStadium.id !== stadium.id) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const stands = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
    for (const stand of stands) {
      const val = stadium[stand + '_stand_price']
      if (!Number.isInteger(val) || val <= 0 || val > 100) throw new BadRequestError(t('error.invalidTicketPrice', {}, locale))
    }
    await query(`UPDATE stadium
        SET ${stands.map(n => n + '_stand_price=?').join(', ')}
        WHERE id=?`, stands.map(n => stadium[n + '_stand_price']).concat([stadium.id]))
    console.log('Updated stadium prices')
    return { success: true }
  }
}
