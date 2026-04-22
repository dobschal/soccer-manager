import { UIElement } from '../lib/UIElement.js'
import { GameAnimation } from './gameAnimation.js'
import { renderEmblem } from './emblem.js'
import { renderPositionBadge } from './positionBadge.js'

/**
 * Sort players by position for display: GK, defenders, midfielders, attackers
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
function positionOrder (a, b) {
  const order = {
    GK: 0,
    LD: 1,
    CD: 2,
    RD: 3,
    DM: 4,
    LM: 5,
    CM: 6,
    RM: 7,
    OM: 8,
    LA: 9,
    CA: 10,
    RA: 11
  }
  return (order[a.in_game_position] ?? 99) - (order[b.in_game_position] ?? 99)
}

/**
 * Render a squad list table for one team
 * @param {Array} teamPlayers
 * @param {string} teamName
 * @returns {string}
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
        <td>${p.in_game_position ? renderPositionBadge(p.in_game_position) : '<small class="text-muted">-</small>'}</td>
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
        <div class="horizontal-scrollable-table">
        <table class="table table-sm mb-0 wide-on-mobile">
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
    </div>
  `
}

/**
 * Render the event ticker showing goals and cards
 * @param {Array} log
 * @param {Object} players
 * @param {string} team1Name
 * @param {string} team2Name
 * @returns {string}
 */
function renderEventTicker (log, players, team1Name, team2Name) {
  const events = log.filter(l => l.goal || l.yellowCard || l.redCard)
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))

  if (events.length === 0) return ''

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
 * Game details partial that renders the match statistics table,
 * event ticker, squad lists, and stadium info.
 */
export class GameDetails extends UIElement {
  /**
   * @param {Object} params
   * @param {Object} params.game - Game result data
   * @param {Object} params.team1 - Team 1 object
   * @param {Object} params.team2 - Team 2 object
   * @param {Object} params.details - Parsed game details
   * @param {Object} params.players - Map of player id to player object
   * @param {Array} params.playersTeam1 - Team 1 players
   * @param {Array} params.playersTeam2 - Team 2 players
   * @param {Object} params.stadium - Stadium data
   */
  constructor (params) {
    super(params)
  }

  get template () {
    const {
      game,
      team1,
      team2,
      details,
      players,
      playersTeam1,
      playersTeam2,
      stadium
    } = this

    const sd = details.stadiumDetails || {}
    const guests = (sd.northGuests || 0) + (sd.southGuests || 0) + (sd.eastGuests || 0) + (sd.westGuests || 0)
    const totalEarnings = sd.totalEarnings ?? ((sd.northEarnings || 0) + (sd.southEarnings || 0) + (sd.eastEarnings || 0) + (sd.westEarnings || 0))
    const totalCapacity = sd.totalCapacity || (stadium
      ? (stadium.north_stand_size || 0) + (stadium.south_stand_size || 0) + (stadium.east_stand_size || 0) + (stadium.west_stand_size || 0)
      : 0)

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

    const detailPlayersA = (details.playerTeamA || []).filter(p => p.in_game_position)
    const detailPlayersB = (details.playerTeamB || []).filter(p => p.in_game_position)
    const freshnessTeamA = detailPlayersA.length ? Math.floor(100 * detailPlayersA.reduce((sum, p) => sum + p.freshness, 0) / detailPlayersA.length) : 0
    const freshnessTeamB = detailPlayersB.length ? Math.floor(100 * detailPlayersB.reduce((sum, p) => sum + p.freshness, 0) / detailPlayersB.length) : 0
    const total = ballControllA + ballControllB

    const team1Emblem = renderEmblem(team1, 20)
    const team2Emblem = renderEmblem(team2, 20)

    const extraTimeLabel = details.extraTime ? ' <small class="text-warning">(E.T.)</small>' : ''

    const statsRows = [
      {
        label: `Goals${extraTimeLabel}`,
        valA: game.goalsTeam1,
        valB: game.goalsTeam2
      },
      {
        label: 'Control',
        valA: `${Math.floor(ballControllA / total * 100)}%`,
        valB: `${Math.ceil(ballControllB / total * 100)}%`
      },
      {
        label: 'Shots',
        valA: details.shotsTeamA || goalsChancesA,
        valB: details.shotsTeamB || goalsChancesB
      },
      {
        label: 'On Target',
        valA: goalsChancesA,
        valB: goalsChancesB
      },
      {
        label: 'Strength',
        valA: details.strengthTeamA,
        valB: details.strengthTeamB
      },
      {
        label: 'Freshness',
        valA: `${freshnessTeamA}%`,
        valB: `${freshnessTeamB}%`
      }
    ]

    return `
      <div>
        <p>It is game day #${game.gameDay + 1} and ${team1.name} welcomes ${guests} as guests at their stadium!</p>
        ${new GameAnimation(game, team1, team2)}
        <div class="horizontal-scrollable-table">
        <table class="table mb-4 wide-on-mobile game-details-table">
          <colgroup>
            <col style="width: 40%">
            <col style="width: 20%">
            <col style="width: 40%">
          </colgroup>
          <thead>
            <tr>
              <td class="text-end">
                <a href="#team?id=${team1.id}" class="text-info border-0">${team1Emblem} ${team1.name}</a>
              </td>
              <th class="text-center">Team</th>
              <td>
                <a href="#team?id=${team2.id}" class="text-info border-0">${team2.name} ${team2Emblem}</a>
              </td>
            </tr>
            ${statsRows.map(row => `
              <tr>
                <td class="text-end">${row.valA}</td>
                <th class="text-center">${row.label}</th>
                <td>${row.valB}</td>
              </tr>
            `).join('')}
          </thead>
        </table>
        </div>
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
                <div class="fs-4 fw-bold">${totalEarnings.toLocaleString()} &euro;</div>
                <div class="text-muted small">Ticket Earnings</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }
}
