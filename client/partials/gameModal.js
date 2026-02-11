import { server } from '../lib/gateway.js'
import { toast } from './toast.js'
import { showOverlay } from './overlay.js'
import { renderGameAnimation } from './gameAnimation.js'
import { setQueryParams } from '../lib/router.js'

/**
 * Render the event ticker showing goals and cards
 * @param {Array} log - Game log entries
 * @param {Object} players - Map of player id to player object
 * @param {string} team1Name - Name of team 1
 * @param {string} team2Name - Name of team 2
 * @returns {string} HTML for the event ticker
 */
function renderEventTicker (log, players, team1Name, team2Name) {
  const events = log.filter(l => l.goal || l.yellowCard || l.redCard)
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))

  if (events.length === 0) {
    return ''
  }

  const eventItems = events.map(event => {
    const player = players[event.player]
    const playerName = player?.name || 'Unknown'
    const isTeam1 = player?.team1
    const minute = event.minute !== undefined ? `${event.minute}'` : ''

    if (event.goal) {
      const teamName = isTeam1 ? team1Name : team2Name
      return `
        <div class="d-flex align-items-center gap-2 py-1 ${isTeam1 ? 'text-start' : 'text-end flex-row-reverse'}">
          <span class="badge bg-success"><i class="fa fa-futbol-o"></i></span>
          <span><strong>${minute || '-'}</strong> ${playerName} <small class="text-muted">(${teamName})</small></span>
        </div>
      `
    } else if (event.redCard) {
      const teamName = isTeam1 ? team1Name : team2Name
      return `
        <div class="d-flex align-items-center gap-2 py-1 ${isTeam1 ? 'text-start' : 'text-end flex-row-reverse'}">
          <span class="text-danger" style="font-size: 1.2em;"><i class="fa fa-square"></i></span>
          <span><strong>${minute || '-'}</strong> ${playerName} <small class="text-muted">(${teamName})</small>${event.secondYellow ? ' <small>(2nd yellow)</small>' : ''}</span>
        </div>
      `
    } else if (event.yellowCard) {
      const teamName = isTeam1 ? team1Name : team2Name
      return `
        <div class="d-flex align-items-center gap-2 py-1 ${isTeam1 ? 'text-start' : 'text-end flex-row-reverse'}">
          <span class="text-warning" style="font-size: 1.2em;"><i class="fa fa-square"></i></span>
          <span><strong>${minute || '-'}</strong> ${playerName} <small class="text-muted">(${teamName})</small></span>
        </div>
      `
    }
    return ''
  }).join('')

  return `
    <div class="card mb-3">
      <div class="card-header"><i class="fa fa-clock-o me-2"></i>Match Events</div>
      <div class="card-body" style="max-height: 200px; overflow-y: auto;">
        ${eventItems}
      </div>
    </div>
  `
}

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
  const {
    players: playersTeam1,
    team: team1
  } = await server.getTeam(game.team1Id)
  const {
    players: playersTeam2,
    team: team2
  } = await server.getTeam(game.team2Id)
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
      <p>It is game day #${game.gameDay + 1} and ${team1.name} welcomes ${guests} as guests at their stadium!</p>
      ${renderGameAnimation(game, team1, team2)}
      ${renderEventTicker(details.log, players, team1.name, team2.name)}
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
