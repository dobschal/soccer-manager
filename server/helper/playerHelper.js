import { query } from '../lib/database.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { generateRandomPlayerName } from '../prepare-season.js'
import { Position } from '../../client/util/formation.js'
import { randomItem } from '../lib/util.js'

async function getTeamCount () {
  const [{ count }] = await query('SELECT COUNT(*) AS count FROM team WHERE is_system_team = 0')
  return count
}

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
 * A player at level 100 in age 22 is 40mio
 * for every age above you take the amount times 0.75
 * for every level below 100, multiply by 0.9330329915368074 (halves every 10 levels)
 * @param {PlayerType} player
 * @returns {Promise<number>} - price in EUR
 */
export async function getAveragePlanPriceOfPlayer (player) {
  const age = await getPlayerAge(player)
  let price = 40_000_000
  for (let a = 22; a < age; a++) {
    price *= 0.75
  }
  for (let l = 100; l > player.level; l--) {
    price *= 0.9330329915368074
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
 * Maintains free players in the market equal to the current number of teams.
 * Deletes random excess players if above minimum, generates weak players if below.
 * @returns {Promise<{deleted: number, generated: number}>}
 */
export async function cleanupOldFreePlayers () {
  const { season } = await getGameDayAndSeason()

  // Find all free players (no team)
  const freePlayers = await query('SELECT * FROM player WHERE team_id IS NULL')

  let deletedCount = 0
  let generatedCount = 0

  const teamCount = await getTeamCount()

  // Delete random players if above minimum
  if (freePlayers.length > teamCount) {
    // Shuffle and pick excess players to delete
    const shuffled = [...freePlayers].sort(() => Math.random() - 0.5)
    const playersToDelete = shuffled.slice(0, freePlayers.length - teamCount)

    for (const player of playersToDelete) {
      await query('DELETE FROM player_history WHERE player_id = ?', [player.id])
      await query('DELETE FROM trade_offer WHERE player_id = ?', [player.id])
      await query('DELETE FROM player WHERE id = ?', [player.id])
      deletedCount++
      console.log(`🗑️ Deleted free player: ${player.name} (ID: ${player.id})`)
    }

    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} free player(s)`)
    }
  }

  // Generate new weak free players if below minimum
  const currentFreeCount = freePlayers.length - deletedCount
  const playersToGenerate = Math.max(0, teamCount - currentFreeCount)

  for (let i = 0; i < playersToGenerate; i++) {
    await _generateWeakFreePlayer(season)
    generatedCount++
  }

  if (generatedCount > 0) {
    console.log(`🆕 Generated ${generatedCount} new free player(s)`)
  }

  return { deleted: deletedCount, generated: generatedCount }
}

/**
 * Generate a weak free player with low market value (< 50,000 EUR)
 * @param {number} season
 */
async function _generateWeakFreePlayer (season) {
  // Level 10-20 players aged 28-32 have very low market value
  const level = 10 + Math.floor(Math.random() * 11) // 10-20
  const age = 28 + Math.floor(Math.random() * 5) // 28-32 years old
  const carrierStartSeason = season - age + 16
  const carrierEndSeason = carrierStartSeason + 20 + Math.floor(Math.random() * 4)

  const positions = Object.values(Position).filter(p => p !== 'GK') // No goalkeepers
  const position = randomItem(positions)

  const player = {
    hair_color: Math.floor(Math.random() * 7),
    skin_color: Math.floor(Math.random() * 3),
    team_id: null,
    name: await generateRandomPlayerName(),
    carrier_start_season: carrierStartSeason,
    carrier_end_season: carrierEndSeason,
    level,
    in_game_position: '',
    position,
    freshness: 0.5 + Math.random() * 0.5 // 50-100% freshness
  }

  await query('INSERT INTO player SET ?', player)
}
