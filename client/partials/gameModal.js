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
  const { result: game } = await server.getResult({ id: resultId })
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
      Result: ${game.goalsTeam1} : ${game.goalsTeam2}, 
      Ball control: ${Math.floor((ballControllA / total) * 100)}% : ${Math.ceil((ballControllB / total) * 100)}%, 
      Guests: ${guests}
     `,
    `
      ${renderGameAnimation(game, team1, team2)}
      ${details.log.map(_renderGameLogItem(players)).join('')}
      `
  )
  overlay.onClose(() => {
    setQueryParams({ game_id: null })
  })
}

function _renderGameLogItem (players) {
  return (logItem, index) => {
    if (logItem.kickoff) {
      return `
        <span class="${players[logItem.player].team1 ? 'left' : 'right'}">
        ${index + 1}. Minute: ${players[logItem.player].name} is playing the first ball.
        </span>
      `
    }
    // if (logItem.lostBall) {
    //   const text = logItem.lostBall
    //     ? players[logItem.player].name + ' is losing the ball to ' + players[logItem.oponentPlayer].name
    //     : players[logItem.player].name + ' blocks the tackling from ' + players[logItem.oponentPlayer].name + ' and keeps the ball'
    //   return `
    //     <span class="${players[logItem.player].team1 ? 'left' : 'right'}">
    //       ${index + 1}. Minute: ${text}
    //     </span>
    //   `
    // }
    if (logItem.keeperHolds) {
      return `
        <span class="${players[logItem.goalKeeper].team1 ? 'left' : 'right'}">
        ${index + 1}. Minute: ${players[logItem.goalKeeper].name} with a great save.
        </span>
      `
    }
    if (logItem.goal) {
      return `
        <span class="${players[logItem.player].team1 ? 'left' : 'right'}">
        ${index + 1}. Minute: GOOOOAAAL... ${players[logItem.player].name} is striking!
        </span>
      `
    }
    return ''
  }
}
