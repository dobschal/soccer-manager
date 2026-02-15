import { server } from '../lib/gateway.js'
import { toast } from './toast.js'
import { showOverlay } from './overlay.js'
import { renderGameAnimation } from './gameAnimation.js'
import { setQueryParams } from '../lib/router.js'

/**
 * Sort players by position for display: GK, defenders, midfielders, attackers
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
function positionOrder (a, b) {
  const order = { GK: 0, LD: 1, CD: 2, RD: 3, DM: 4, LM: 5, CM: 6, RM: 7, OM: 8, LA: 9, CA: 10, RA: 11 }
  return (order[a.in_game_position] ?? 99) - (order[b.in_game_position] ?? 99)
}

/**
 * Render a squad list table for one team
 * @param {Array} teamPlayers - Players from details.playerTeamA or playerTeamB
 * @param {string} teamName
 * @returns {string} HTML
 */
function renderSquadList (teamPlayers, teamName) {
  if (!teamPlayers || teamPlayers.length === 0) return ''

  const sorted = [...teamPlayers].sort(positionOrder)
  const rows = sorted.map(p => {
    const freshnessPct = Math.floor(p.freshness * 100)
    const originalLevel = p.freshness > 0 ? Math.round(p.level / p.freshness) : p.level
    const freshnessColor = freshnessPct < 40 ? 'text-danger' : freshnessPct < 70 ? 'text-warning' : 'text-success'
    return `
      <tr>
        <td><small class="text-muted">${p.in_game_position || '-'}</small></td>
        <td>${p.name}</td>
        <td class="text-end">${originalLevel}</td>
        <td class="text-end ${freshnessColor}">${freshnessPct}%</td>
      </tr>
    `
  }).join('')

  return `
    <div class="card mb-3">
      <div class="card-header"><i class="fa fa-users me-2"></i>${teamName}</div>
      <div class="card-body p-0">
        <table class="table table-sm mb-0">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Name</th>
              <th class="text-end">Lvl</th>
              <th class="text-end">Fit</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `
}

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
          <span class="text-danger event-ticker-icon"><i class="fa fa-square"></i></span>
          <span><strong>${minute || '-'}</strong> ${playerName} <small class="text-muted">(${teamName})</small>${event.secondYellow ? ' <small>(2nd yellow)</small>' : ''}</span>
        </div>
      `
    } else if (event.yellowCard) {
      const teamName = isTeam1 ? team1Name : team2Name
      return `
        <div class="d-flex align-items-center gap-2 py-1 ${isTeam1 ? 'text-start' : 'text-end flex-row-reverse'}">
          <span class="text-warning event-ticker-icon"><i class="fa fa-square"></i></span>
          <span><strong>${minute || '-'}</strong> ${playerName} <small class="text-muted">(${teamName})</small></span>
        </div>
      `
    }
    return ''
  }).join('')

  return `
    <div class="card mb-3">
      <div class="card-header"><i class="fa fa-clock-o me-2"></i>Match Events</div>
      <div class="card-body event-ticker-body">
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
  const sd = details.stadiumDetails || {}
  const guests = (sd.northGuests || 0) + (sd.southGuests || 0) + (sd.eastGuests || 0) + (sd.westGuests || 0)
  const totalEarnings = sd.totalEarnings ?? ((sd.northEarnings || 0) + (sd.southEarnings || 0) + (sd.eastEarnings || 0) + (sd.westEarnings || 0))
  const totalCapacity = sd.totalCapacity || (stadium
    ? (stadium.north_stand_size || 0) + (stadium.south_stand_size || 0) + (stadium.east_stand_size || 0) + (stadium.west_stand_size || 0)
    : 0)
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
      <table class="table mb-4">
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
            <td scope="col" class="text-end">${details.shotsTeamA || goalsChancesA}</td>
            <th scope="col" class="text-center">Shots</th>
            <td scope="col">${details.shotsTeamB || goalsChancesB}</td>
          </tr>
          <tr>
            <td scope="col" class="text-end">${goalsChancesA}</td>
            <th scope="col" class="text-center">On Target</th>
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
      ${renderEventTicker(details.log, players, team1.name, team2.name)}
      ${renderSquadList(details.playerTeamA, team1.name)}
      ${renderSquadList(details.playerTeamB, team2.name)}

      <div class="card">
        <div class="card-header"><i class="fa fa-ticket me-2"></i>Stadium</div>
        <div class="card-body">
          <div class="row text-center">
            <div class="col-4">
              <div class="fs-4 fw-bold">${guests.toLocaleString()}</div>
              <div class="text-muted small">Guests</div>
            </div>
            <div class="col-4">
              <div class="fs-4 fw-bold">${totalCapacity ? Math.round(guests / totalCapacity * 100) : '-'}%</div>
              <div class="text-muted small">Capacity</div>
            </div>
            <div class="col-4">
              <div class="fs-4 fw-bold">${totalEarnings.toLocaleString()} €</div>
              <div class="text-muted small">Ticket Earnings</div>
            </div>
          </div>
        </div>
      </div>
    `
  )
  overlay.onClose(() => {
    setQueryParams({ game_id: null })
  })
}
