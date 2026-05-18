import { query } from '../lib/database.js'

export const MIN_TEAM_SIZE = 14
import { getGameDayAndSeason } from './gameDayHelper.js'
import { generateRandomPlayerName } from '../prepare-season.js'
import { Position } from '../../client/util/formation.js'
import { randomItem } from '../lib/util.js'

const POSITIONS = Object.values(Position)

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

const MIN_FREE_PER_POSITION = 5
const MAX_FREE_PER_POSITION = 10

/**
 * Maintains free players in the market: at least 5 per position, at most 10 per position.
 * Deletes excess players and generates new ones to fill gaps.
 * @returns {Promise<{deleted: number, generated: number}>}
 */
export async function cleanupOldFreePlayers () {
  const { season } = await getGameDayAndSeason()

  // Find all free players (no team), excluding retired players (kept in DB for history)
  const freePlayers = await query('SELECT * FROM player WHERE team_id IS NULL AND carrier_end_season > ?', [season])

  // Group free players by position
  const byPosition = {}
  for (const pos of POSITIONS) {
    byPosition[pos] = []
  }
  for (const player of freePlayers) {
    if (byPosition[player.position]) {
      byPosition[player.position].push(player)
    }
  }

  let deletedCount = 0
  let generatedCount = 0

  for (const pos of POSITIONS) {
    const players = byPosition[pos]

    // Delete excess players if above maximum
    if (players.length > MAX_FREE_PER_POSITION) {
      const shuffled = [...players].sort(() => Math.random() - 0.5)
      const toDelete = shuffled.slice(0, players.length - MAX_FREE_PER_POSITION)
      for (const player of toDelete) {
        await query('DELETE FROM player_history WHERE player_id = ?', [player.id])
        await query('DELETE FROM trade_offer WHERE player_id = ?', [player.id])
        await query('DELETE FROM player WHERE id = ?', [player.id])
        deletedCount++
      }
    }

    // Generate new players if below minimum
    const currentCount = Math.min(players.length, MAX_FREE_PER_POSITION)
    if (currentCount < MIN_FREE_PER_POSITION) {
      const toGenerate = MIN_FREE_PER_POSITION - currentCount
      for (let i = 0; i < toGenerate; i++) {
        await _generateWeakFreePlayer(season, pos)
        generatedCount++
      }
    }
  }

  if (deletedCount > 0) {
    console.log(`🧹 Cleaned up ${deletedCount} excess free player(s)`)
  }
  if (generatedCount > 0) {
    console.log(`🆕 Generated ${generatedCount} new free player(s) to fill position gaps`)
  }

  return { deleted: deletedCount, generated: generatedCount }
}

/**
 * Generate a weak free player with low market value (< 50,000 EUR)
 * @param {number} season
 * @param {string} [forPosition] - specific position to generate, or random if omitted
 */
async function _generateWeakFreePlayer (season, forPosition) {
  // Level 10-20 players aged 28-32 have very low market value
  const level = 10 + Math.floor(Math.random() * 11) // 10-20
  const age = 28 + Math.floor(Math.random() * 5) // 28-32 years old
  const carrierStartSeason = season - age + 16
  const carrierEndSeason = carrierStartSeason + 20 + Math.floor(Math.random() * 4)

  const position = forPosition || randomItem(POSITIONS)

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
