import { server } from '../lib/gateway.js'
import { toast } from './toast.js'
import { showOverlay } from './overlay.js'
import { setQueryParams } from '../lib/router.js'
import { GameDetails } from './gameDetails.js'

/**
 * @param {number} resultId
 * @returns {Promise<void>}
 * @private
 */
export async function showGameModal (resultId) {
  const response = await server.getResult(resultId)
  /** @type {GameResultType} */
  const game = response.result
  if (game.details === '{}') {
    toast('Game not played yet.')
    setQueryParams({ game_id: null })
    return
  }
  const [
    {
      players: playersTeam1,
      team: team1
    },
    {
      players: playersTeam2,
      team: team2
    },
    stadium
  ] = await Promise.all([
    server.getTeam(game.team1Id),
    server.getTeam(game.team2Id),
    server.getStadiumByTeamId(game.team1Id)
  ])
  const players = {}
  playersTeam1.forEach(p => {
    p.team1 = true
    players[p.id] = p
  })
  playersTeam2.forEach(p => {
    p.team2 = true
    players[p.id] = p
  })
  const details = JSON.parse(game.details)
  if (!details.log) return toast('No game result available')

  const gameDetails = new GameDetails({
    game,
    team1,
    team2,
    details,
    players,
    playersTeam1,
    playersTeam2,
    stadium
  })

  const overlay = showOverlay(
    `${game.team1} - ${game.team2}`,
    '',
    `${gameDetails}`
  )
  overlay.onClose(() => {
    setQueryParams({ game_id: null })
  })
}
