import { query } from '../lib/database.js'
import { getPositionsOfFormation } from '../../client/util/formation.js'
import { addLogMessage } from './logMessageHelper.js'
import { getUserLocale, t } from '../i18n/index.js'

/**
 * Auto-fill incomplete lineup for a team before a game.
 * Finds missing positions and assigns random matching bench players.
 * @param {TeamType} team
 * @param {PlayerType[]} lineupPlayers - players currently in the lineup (non-suspended)
 * @returns {Promise<PlayerType[]>} updated lineup players
 */
export async function autoFillLineup (team, lineupPlayers) {
  const requiredPositions = getPositionsOfFormation(team.formation)
  if (!requiredPositions) return lineupPlayers

  const filledPositions = lineupPlayers.map(p => p.in_game_position)

  const remainingFilled = [...filledPositions]
  const missingPositions = []
  for (const pos of requiredPositions) {
    const idx = remainingFilled.indexOf(pos)
    if (idx !== -1) {
      remainingFilled.splice(idx, 1)
    } else {
      missingPositions.push(pos)
    }
  }

  if (missingPositions.length === 0) return lineupPlayers

  const benchPlayers = await query(
    'SELECT * FROM player WHERE team_id=? AND (in_game_position=\'\' OR in_game_position IS NULL) AND is_suspended=0 AND is_injured=0 AND tour_days_left=0',
    [team.id]
  )

  const locale = team.user_id ? await getUserLocale(team.user_id) : 'en'
  const addedPlayers = []

  for (const position of missingPositions) {
    let candidates = benchPlayers.filter(p =>
      p.position === position && !addedPlayers.includes(p.id)
    )

    if (candidates.length === 0) {
      candidates = benchPlayers.filter(p => !addedPlayers.includes(p.id))
    }

    if (candidates.length === 0) break

    const chosen = candidates[Math.floor(Math.random() * candidates.length)]
    chosen.in_game_position = position
    addedPlayers.push(chosen.id)

    await query('UPDATE player SET in_game_position=? WHERE id=?', [position, chosen.id])

    if (team.user_id) {
      await addLogMessage(
        t('log.lineupAutoFilled', { playerName: chosen.name, position }, locale),
        team,
        'OPEN_MY_TEAM_PAGE',
        null,
        'users',
        undefined,
        'info'
      )
    }

    lineupPlayers.push(chosen)
  }

  return lineupPlayers
}

/**
 * Trim lineup to match the formation's required positions. Any player whose
 * in_game_position does not match an available slot (e.g. position is no
 * longer in the formation, or the slot is already taken by another player)
 * is removed from the lineup.
 * @param {TeamType} team
 * @param {PlayerType[]} lineupPlayers
 * @returns {Promise<PlayerType[]>}
 */
export async function trimExcessLineup (team, lineupPlayers) {
  const requiredPositions = getPositionsOfFormation(team.formation)
  if (!requiredPositions) return lineupPlayers

  const kept = []
  const remainingSlots = [...requiredPositions]

  for (const player of lineupPlayers) {
    const idx = remainingSlots.indexOf(player.in_game_position)
    if (idx !== -1) {
      kept.push(player)
      remainingSlots.splice(idx, 1)
    }
  }

  if (kept.length === lineupPlayers.length) return lineupPlayers

  console.log(`Team ${team.name} had ${lineupPlayers.length - kept.length} mismatched lineup player(s) for formation ${team.formation} - trimming`)

  const keptIds = new Set(kept.map(p => p.id))
  for (const player of lineupPlayers) {
    if (!keptIds.has(player.id)) {
      await query('UPDATE player SET in_game_position=\'\' WHERE id=?', [player.id])
    }
  }

  return kept
}
