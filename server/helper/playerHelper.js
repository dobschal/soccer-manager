import { query } from '../lib/database.js'
import { getGameDayAndSeason } from './gameDayHelper.js'

const GAME_DAYS_PER_SEASON = 34
const FREE_PLAYER_EXPIRY_GAME_DAYS = 6

/**
 * @param {number} id
 * @returns {Promise<PlayerType>}
 */
export async function getPlayerById (id) {
  const [player] = await query('SELECT * FROM player WHERE id=? LIMIT 1', [id])
  return player
}

/**
 * @param {PlayerType} player
 * @param {number} [season]
 * @returns {Promise<number>}
 */
export async function getPlayerAge (player, season) {
  if (typeof season === 'undefined') {
    const r = await getGameDayAndSeason()
    season = r.season
  }
  return season - player.carrier_start_season + 16
}

/**
 * A player at level 10 in age 22 is 50mio
 * for every age above you take the amount times 0.75
 * for every level less, the same
 * @param {PlayerType} player
 * @returns {Promise<number>} - price in EUR
 */
export async function getAveragePlanPriceOfPlayer (player) {
  const age = await getPlayerAge(player)
  let price = 50_000_000
  for (let a = 22; a < age; a++) {
    price *= 0.75
  }
  for (let l = 10; l > player.level; l--) {
    price *= 0.5
  }
  return Math.floor(price)
}

/**
 * @param {number} teamId
 * @returns {Promise<Array<PlayerType>>}
 */
export async function getPlayersByTeamId (teamId) {
  return await query('SELECT * FROM player WHERE team_id=?', [teamId])
}

/**
 * Calculate the total game days since a given season/gameDay
 * @param {number} season
 * @param {number} gameDay
 * @param {number} currentSeason
 * @param {number} currentGameDay
 * @returns {number}
 */
function calculateGameDaysDifference (season, gameDay, currentSeason, currentGameDay) {
  const totalGameDaysThen = season * GAME_DAYS_PER_SEASON + gameDay
  const totalGameDaysNow = currentSeason * GAME_DAYS_PER_SEASON + currentGameDay
  return totalGameDaysNow - totalGameDaysThen
}

/**
 * Delete free players that have been without a team for too long
 * Players are deleted if they were fired more than 6 game days ago (~3 real days)
 * @returns {Promise<number>} Number of players deleted
 */
export async function cleanupOldFreePlayers () {
  const { gameDay, season } = await getGameDayAndSeason()

  // Find all free players (no team)
  const freePlayers = await query('SELECT * FROM player WHERE team_id IS NULL')

  if (freePlayers.length === 0) {
    return 0
  }

  let deletedCount = 0

  for (const player of freePlayers) {
    // Find the most recent FIRED entry in player history
    const [lastFired] = await query(
      'SELECT * FROM player_history WHERE player_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1',
      [player.id, 'FIRED']
    )

    if (!lastFired) {
      // No FIRED history - might be a player that was never on a team, skip
      continue
    }

    const daysSinceFired = calculateGameDaysDifference(
      lastFired.season,
      lastFired.game_day,
      season,
      gameDay
    )

    if (daysSinceFired >= FREE_PLAYER_EXPIRY_GAME_DAYS) {
      // Delete player history first (foreign key constraint)
      await query('DELETE FROM player_history WHERE player_id = ?', [player.id])
      // Delete any remaining trade offers
      await query('DELETE FROM trade_offer WHERE player_id = ?', [player.id])
      // Delete the player
      await query('DELETE FROM player WHERE id = ?', [player.id])
      deletedCount++
      console.log(`🗑️ Deleted expired free player: ${player.name} (ID: ${player.id})`)
    }
  }

  if (deletedCount > 0) {
    console.log(`🧹 Cleaned up ${deletedCount} expired free player(s)`)
  }

  return deletedCount
}
