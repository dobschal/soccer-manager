import { server } from '../lib/gateway.js'
import { toast } from './toast.js'
import { showOverlay } from './overlay.js'
import { renderGameAnimation } from './gameAnimation.js'
import { setQueryParams } from '../lib/router.js'
import { renderTable } from './table.js'

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
  const goalsChancesA = details.log.filter(l => l.keeperHolds && playersTeam1.some(p => l.player === p.id)).length + game.goalsTeam1
  const goalsChancesB = details.log.filter(l => l.keeperHolds && playersTeam2.some(p => l.player === p.id)).length + game.goalsTeam2
  details.log.filter(l => typeof l.lostBall === 'boolean').forEach(l => {
    try {
      if (l.lostBall && players[l.player]?.team1) {
        ballControllB++
      } else if (l.lostBall && !players[l.player]?.team1) {
        ballControllA++
      } else if (!l.lostBall && players[l.player]?.team1) {
        ballControllA++
      } else if (!l.lostBall && !players[l.player]?.team1) {
        ballControllB++
      }
    } catch (e) {
      console.error('Error on game details: ', e)
    }
  })
  const freshnessTeamA = Math.floor(100 * playersTeam1.filter(p => p.in_game_position).reduce((sum, p) => sum + p.freshness, 0) / playersTeam1.filter(p => p.in_game_position).length)
  const freshnessTeamB = Math.floor(100 * playersTeam2.filter(p => p.in_game_position).reduce((sum, p) => sum + p.freshness, 0) / playersTeam2.filter(p => p.in_game_position).length)
  const total = ballControllA + ballControllB
  const overlay = showOverlay(
    `${game.team1} - ${game.team2}`,
    '',
    `
      <p>It is game day #${game.gameDay + 1} and ${team1.name} welcomes ${guests} guests at their stadium!</p>
      ${renderGameAnimation(game, team1, team2)}
      <table class="table">
        <thead>
          <tr>
            <td scope="col" class="text-end">${team1.name}</td>
            <th scope="col" class="text-center">Team</th>
            <td scope="col">${team2.name}</td>        
          </tr>
          <tr>
            <td scope="col" class="text-end">${game.goalsTeam1}</td>
            <th scope="col" class="text-center">Goals</th>
            <td scope="col">${game.goalsTeam2}</td>        
          </tr>
          <tr>
            <td scope="col" class="text-end">${Math.floor(ballControllA / total * 100)}%</td>
            <th scope="col" class="text-center">Control</th>
            <td scope="col">${Math.ceil(ballControllB / total * 100)}%</td>        
          </tr>
          <tr>
            <td scope="col" class="text-end">${goalsChancesA}</td>
            <th scope="col" class="text-center">Chances</th>
            <td scope="col">${goalsChancesB}</td>        
          </tr>
          <tr>
            <td scope="col" class="text-end">${details.strengthTeamA}</td>
            <th scope="col" class="text-center">Strength</th>
            <td scope="col">${details.strengthTeamB}</td>        
          </tr>
          <tr>
            <td scope="col" class="text-end">${freshnessTeamA}%</td>
            <th scope="col" class="text-center">Freshness</th>
            <td scope="col">${freshnessTeamB}%</td>        
          </tr>
        </thead> 
      </table>
    `
  )
  overlay.onClose(() => {
    setQueryParams({ game_id: null })
  })
}
