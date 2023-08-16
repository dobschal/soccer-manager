import { server } from '../lib/gateway.js'
import { toast } from './toast.js'
import { showOverlay } from './overlay.js'
import { renderGameAnimation } from './gameAnimation.js'
import { setQueryParams } from '../lib/router.js'

/**
 * @param {number} resultId
 * @returns {Promise<void>}
 * @private
 */
export async function showGameModal (resultId) {
  const response = await server.getResult({ id: resultId })
  /** @type {GameResultType} */
  const game = response.result
  if (game.details === '{}') {
    toast('Game not played yet.')
    setQueryParams({ game_id: null })
    return
  }
  const { players: playersTeam1, team: team1 } = await server.getTeam({ teamId: game.team1Id })
  const { players: playersTeam2, team: team2 } = await server.getTeam({ teamId: game.team2Id })
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
  const guests = details.stadiumDetails.northGuests + details.stadiumDetails.southGuests + details.stadiumDetails.eastGuests + details.stadiumDetails.westGuests
  if (!details.log) return toast('No game result available')
  let ballControllA = 0
  let ballControllB = 0
  details.log.filter(l => typeof l.lostBall === 'boolean').forEach(l => {
    try {
      if (l.lostBall && players[l.player].team1) {
        ballControllB++
      } else if (l.lostBall && !players[l.player].team1) {
        ballControllA++
      } else if (!l.lostBall && players[l.player].team1) {
        ballControllA++
      } else if (!l.lostBall && !players[l.player].team1) {
        ballControllB++
      }
    } catch (e) {
      console.error('Error on game details: ', e)
    }
  })
  const total = ballControllA + ballControllB
  const overlay = showOverlay(
    `${game.team1} - ${game.team2}`,
    ` 
      It is game day #${game.gameDay + 1} and ${team1.name} welcomes ${guests} guests at their stadium!
     `,
    `
      ${renderGameAnimation(game, team1, team2)}
      `
  )
  overlay.onClose(() => {
    setQueryParams({ game_id: null })
  })
}
