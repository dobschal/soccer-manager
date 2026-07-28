import { goTo, setQueryParams } from '../lib/router.js'
import { showHeadToHeadOverlay } from '../partials/headToHeadOverlay.js'

/**
 * Navigate to a team's detail page. No-op when the id is missing (e.g. cup
 * byes or placeholder rows).
 * @param {number|string} [teamId]
 * @returns {void}
 */
export function goToTeamPage (teamId) {
  if (teamId == null) return
  goTo(`team?id=${teamId}`)
}

/**
 * Open the "center" action for a game row shown on a results sub-page:
 * the game-details modal (via the `game_id` query param the results parent
 * page watches) for played games, or the head-to-head overlay for games that
 * haven't been played yet.
 * @param {Object} game
 * @param {boolean} game.isPlayed - Whether the game has been played
 * @param {number} [game.id] - Result id (needed for the game-details modal)
 * @param {number} [game.team1Id]
 * @param {number} [game.team2Id]
 * @returns {void}
 */
export function openGameCenter ({ isPlayed, id, team1Id, team2Id }) {
  if (isPlayed) {
    if (id != null) setQueryParams({ game_id: id })
  } else if (team1Id != null && team2Id != null) {
    void showHeadToHeadOverlay(team1Id, team2Id)
  }
}
