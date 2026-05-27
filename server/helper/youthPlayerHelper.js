import { query } from '../lib/database.js'
import { YouthPlayer } from '../entities/youthPlayer.js'
import { Player } from '../entities/player.js'
import { randomItem } from '../lib/util.js'
import { Position } from '../../client/util/formation.js'
import { generateRandomPlayerName } from '../prepare-season.js'

/**
 * Training mode effects on fitness, moral, and level gain
 * @type {Object<string, {fitness: number, moral: number, levelBonus: number}>}
 */
export const TRAINING_MODE_EFFECTS = {
  training: { fitness: +0.02, moral: -0.05, levelBonus: 1.2 },
  friendly_match: { fitness: -0.04, moral: +0.05, levelBonus: 1.0 },
  rest: { fitness: +0.06, moral: +0.04, levelBonus: 0.3 }
}

/**
 * Base level gain per game day
 * Calculated to allow talent=1.0, perfect rhythm player to reach level 30 in 34 game days
 * With talent=1.0 and avg condition=0.85: gain = BASE * 3.5 * 1.0 * 0.85 ≈ 0.59/day
 * Over 34 days: 34 * 0.59 = 20.0 level gain (from 10.0 to 30.0)
 */
export const BASE_LEVEL_GAIN = 0.2

/**
 * Calculate the age of a youth player in the given season
 * @param {YouthPlayerType} youthPlayer
 * @param {number} season
 * @returns {number}
 */
export function getYouthPlayerAge (youthPlayer, season) {
  return 15 + (season - youthPlayer.birth_season)
}

/**
 * Get all youth players for a team
 * @param {number} teamId
 * @returns {Promise<YouthPlayerType[]>}
 */
export async function getYouthPlayersByTeam (teamId) {
  return await query('SELECT * FROM youth_player WHERE team_id=?', [teamId])
}

/**
 * Get a youth player by ID
 * @param {number} id
 * @returns {Promise<YouthPlayerType|null>}
 */
export async function getYouthPlayerById (id) {
  const [player] = await query('SELECT * FROM youth_player WHERE id=?', [id])
  return player || null
}

/**
 * Create a new youth player for a team
 * @param {number} teamId
 * @param {number} season - current season (player will be 15)
 * @returns {Promise<YouthPlayerType>}
 */
export async function createYouthPlayer (teamId, season) {
  const name = await generateRandomPlayerName()
  const talent = 0.1 + Math.random() * 0.9 // 0.1 to 1.0
  const level = 1 + Math.random() * 9 // 1 to 10

  const youthPlayer = new YouthPlayer({
    team_id: teamId,
    name,
    position: randomItem(Object.values(Position)),
    level,
    talent,
    moral: 0.7,
    fitness: 0.7,
    hair_color: Math.floor(Math.random() * 7),
    skin_color: Math.floor(Math.random() * 4),
    birth_season: season // They are 15 years old at current season
  })

  const { insertId } = await query('INSERT INTO youth_player SET ?', youthPlayer)
  youthPlayer.id = insertId
  return youthPlayer
}

/**
 * Apply training effects to a youth player for one game day
 * @param {YouthPlayerType} youthPlayer
 * @param {string} trainingMode - 'training', 'friendly_match', or 'rest'
 * @returns {YouthPlayerType} - The updated youth player
 */
export function applyTrainingEffects (youthPlayer, trainingMode) {
  const effects = TRAINING_MODE_EFFECTS[trainingMode] || TRAINING_MODE_EFFECTS.rest

  // Apply randomness of about 10%
  const randomFactor = 0.9 + Math.random() * 0.2 // 0.9 to 1.1

  // Update fitness and moral with bounds [0, 1]
  youthPlayer.fitness = Math.max(0, Math.min(1, youthPlayer.fitness + effects.fitness * randomFactor))
  youthPlayer.moral = Math.max(0, Math.min(1, youthPlayer.moral + effects.moral * randomFactor))

  // Calculate level gain
  // Formula: gain = BASE_GAIN * (1 + talent * 2.5) * modeBonus * avgCondition * randomFactor
  const avgCondition = (youthPlayer.fitness + youthPlayer.moral) / 2
  const talentMultiplier = 1 + youthPlayer.talent * 2.5
  const levelGain = BASE_LEVEL_GAIN * talentMultiplier * effects.levelBonus * avgCondition * randomFactor

  youthPlayer.level = youthPlayer.level + levelGain

  return youthPlayer
}

/**
 * Process training for all youth players of a team
 * @param {TeamType} team
 * @returns {Promise<void>}
 */
export async function processYouthTraining (team) {
  const trainingMode = team.youth_training_mode || 'rest'
  const youthPlayers = await getYouthPlayersByTeam(team.id)

  for (const youthPlayer of youthPlayers) {
    applyTrainingEffects(youthPlayer, trainingMode)
    await query(
      'UPDATE youth_player SET level=?, moral=?, fitness=? WHERE id=?',
      [youthPlayer.level, youthPlayer.moral, youthPlayer.fitness, youthPlayer.id]
    )
  }
}

/**
 * Promote a youth player to the A Team
 * @param {YouthPlayerType} youthPlayer
 * @param {number} _season - current season (unused, kept for API compatibility)
 * @returns {Promise<PlayerType>}
 */
export async function promoteYouthPlayer (youthPlayer, _season) {
  // Calculate carrier_start_season so that age calculation works correctly
  // In the player system, carrier_start_season is the season when player was 16
  const carrierStartSeason = youthPlayer.birth_season + 1
  const carrierLength = 20 + Math.floor(Math.random() * 4) // 20-23 years career

  const player = new Player({
    team_id: youthPlayer.team_id,
    name: youthPlayer.name,
    position: youthPlayer.position,
    in_game_position: '',
    level: Math.floor(youthPlayer.level), // Floor the level
    hair_color: youthPlayer.hair_color,
    skin_color: youthPlayer.skin_color,
    carrier_start_season: carrierStartSeason,
    carrier_end_season: carrierStartSeason + carrierLength,
    freshness: youthPlayer.fitness
  })

  const { insertId } = await query('INSERT INTO player SET ?', player)
  player.id = insertId

  // Delete from youth_player table
  await query('DELETE FROM youth_player WHERE id=?', [youthPlayer.id])

  return player
}

/**
 * Fire (delete) a youth player
 * @param {number} youthPlayerId
 * @returns {Promise<void>}
 */
export async function fireYouthPlayer (youthPlayerId) {
  await query('DELETE FROM youth_player WHERE id=?', [youthPlayerId])
}

/**
 * Archive (auto-fire) youth players who are 19+ years old
 * @param {number} season - current season
 * @returns {Promise<number>} - Number of archived players
 */
export async function archiveOverageYouthPlayers (season) {
  // Youth players with age 19+ (birth_season <= season - 4, since age = 15 + (season - birth_season))
  // Age 19 means: season - birth_season = 4, so birth_season = season - 4
  const cutoffBirthSeason = season - 4
  const result = await query(
    'DELETE FROM youth_player WHERE birth_season <= ?',
    [cutoffBirthSeason]
  )
  return result.affectedRows || 0
}

/**
 * Get youth players who will be auto-fired next season (currently 18 years old)
 * @param {number} teamId
 * @param {number} season - current season
 * @returns {Promise<YouthPlayerType[]>}
 */
export async function getYouthPlayersAt18 (teamId, season) {
  // Age 18 means: season - birth_season = 3, so birth_season = season - 3
  const birthSeasonFor18 = season - 3
  return await query(
    'SELECT * FROM youth_player WHERE team_id=? AND birth_season=?',
    [teamId, birthSeasonFor18]
  )
}

/**
 * Update the training mode for a team's youth team
 * @param {number} teamId
 * @param {string} mode - 'training', 'friendly_match', or 'rest'
 * @returns {Promise<void>}
 */
export async function setYouthTrainingMode (teamId, mode) {
  const validModes = ['training', 'friendly_match', 'rest']
  if (!validModes.includes(mode)) {
    mode = 'rest'
  }
  await query('UPDATE team SET youth_training_mode=? WHERE id=?', [mode, teamId])
}
