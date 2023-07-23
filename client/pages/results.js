import { onClick } from '../lib/htmlEventHandlers.js'
import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { getQueryParams, goTo, setQueryParams } from '../lib/router.js'
import { showOverlay } from '../partials/overlay.js'
import { toast } from '../partials/toast.js'

let myTeamId, info

export async function renderResultsPage () {
  info = await server.getMyTeam()
  myTeamId = info.team.id
  const { level, league } = getLeagueAndLevel()
  const { season, gameDay } = await getSeasonAndGameDay()
  const { results } = await server.getResults({ season, gameDay, level, league })
  const standing = await server.getStanding({ season, gameDay, level, league })

  onClick('#prev-game-day-button', async () => {
    setQueryParams({
      season,
      gameDay: gameDay - 1
    })
  })

  onClick('#next-game-day-button', async () => {
    setQueryParams({
      season,
      gameDay: gameDay + 1
    })
  })

  onClick('#prev-season-button', async () => {
    setQueryParams({
      season: season - 1,
      gameDay: 0
    })
  })

  onClick('#next-season-button', async () => {
    setQueryParams({
      season: season + 1,
      gameDay: 0
    })
  })

  onClick('#prev-league-button', async () => {
    setQueryParams(getPrevLeague(level, league))
  })

  onClick('#next-league-button', async () => {
    setQueryParams(getNextLeague(level, league))
  })

  return `
    <div class="mb-4">
      <h2>Results</h2>
      <p>
        <b>League</b>: 
          <span id="prev-league-button" class="fa fa-chevron-left fa-button"></span> 
          ${level + 1}.${league + 1}
          <span id="next-league-button" class="fa fa-chevron-right fa-button"></span><br>        
        <b>Season</b>: 
          <span id="prev-season-button" class="fa fa-chevron-left fa-button"></span> 
          ${season + 1}
          <span id="next-season-button" class="fa fa-chevron-right fa-button"></span><br>        
        <b>Game day</b>: 
          <span id="prev-game-day-button" class="fa fa-chevron-left fa-button"></span> 
          ${gameDay + 1} 
          <span id="next-game-day-button" class="fa fa-chevron-right fa-button"></span><br>        
      </p>
    </div>
    <h3>Games</h3>
    <table class="table table-hover">
      <thead>
        <tr>
          <th scope="col">Team 1</th>
          <th scope="col">Team 2</th>
          <th scope="col">Result</th>
        </tr>
      </thead>
      <tbody>
          ${results.map(_renderResultListItem).join('')}
      </tbody>
    </table>
    <h3>Standing</h3>
    <table class="table table-hover">
    <thead>
      <tr>
        <th scope="col">#</th>
        <th scope="col">Team</th>
        <th scope="col">Games</th>
        <th scope="col" class="d-none d-md-table-cell">Goals</th>
        <th scope="col" class="d-none d-lg-table-cell">Diff</th>
        <th scope="col">Points</th>        
      </tr>
    </thead>
    <tbody>
      ${standing.sort(_sortStanding).map(_renderStandingListItem).join('')}
    </tbody>
  </table>
  `
}

function getLeagueAndLevel () {
  let { level, league } = getQueryParams()
  if (typeof level === 'undefined') level = info.team.level
  else level = Number(level)
  if (typeof league === 'undefined') league = info.team.league
  else league = Number(league)
  if (league < 0) league = 0
  if (level < 0) level = 0
  return { level, league }
}

function getPrevLeague (level, league) {
  if (league === 0) {
    level--
    league = Math.pow(2, level) - 1
  } else {
    league--
  }
  return { level, league }
}

function getNextLeague (level, league) {
  if (league === Math.pow(2, level) - 1) {
    level++
    league = 0
  } else {
    league++
  }
  return { level, league }
}

function _renderStandingListItem (standingItem, index) {
  const id = generateId()

  onClick('#' + id, () => goTo(`team?id=${standingItem.team.id}`))

  const trClasses = [
    myTeamId === standingItem.team.id ? 'table-info' : '',
    index < 2 ? 'table-success' : '',
    index > 13 ? 'table-warning' : ''
  ]

  return `
    <tr id="${id}" class="${trClasses.join(' ')}">
      <td>${index + 1}.</td>
      <td>${standingItem.team.name}</td>
      <td>${standingItem.games}</td>
      <td class="d-none d-md-table-cell">${standingItem.goals}:${standingItem.against}</td>
      <td class="d-none d-lg-table-cell">${standingItem.goals - standingItem.against}</td>
      <td>${standingItem.points}</td>
    </tr>
  `
}

async function getSeasonAndGameDay () {
  let { season, gameDay } = getQueryParams()
  if (typeof season === 'undefined' && typeof gameDay === 'undefined') {
    const response = await server.getCurrentGameday()
    season = response.season; gameDay = Math.max(0, response.gameDay - 1)
  } else {
    season = Number(season)
    gameDay = Number(gameDay)
  }
  if (gameDay > 33) gameDay = 33
  if (gameDay < 0) gameDay = 0
  if (season < 0) season = 0
  return { season, gameDay }
}

function _renderResultListItem (result) {
  const details = JSON.parse(result.details)
  const id = generateId()

  onClick('#' + id, () => {
    _showGameModal(result)
  })

  return `
    <tr id="${id}">
      <td>
        ${myTeamId === result.team1Id ? '<b>' : ''}
        ${result.team1} (${details.strengthTeamA ?? '-'})
        ${myTeamId === result.team1Id ? '</b>' : ''}
      </td>
      <td>
        ${myTeamId === result.team2Id ? '<b>' : ''}
        ${result.team2} (${details.strengthTeamB ?? '-'})
        ${myTeamId === result.team2Id ? '</b>' : ''}
      </td>
      <td>${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}</td>
    </tr>
  `
}

function _sortStanding (s1, s2) {
  const retVal = s2.points - s1.points
  if (retVal === 0) {
    return (s2.goals - s2.against) - (s1.goals - s1.against)
  }
  return retVal
}

async function _showGameModal (game) {
  const { players: playersTeam1 } = await server.getTeam({ teamId: game.team1Id })
  const { players: playersTeam2 } = await server.getTeam({ teamId: game.team2Id })
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
    if (l.lostBall && players[l.player].team1) {
      ballControllB++
    } else if (l.lostBall && !players[l.player].team1) {
      ballControllA++
    } else if (!l.lostBall && players[l.player].team1) {
      ballControllA++
    } else if (!l.lostBall && !players[l.player].team1) {
      ballControllB++
    }
  })
  const total = ballControllA + ballControllB
  showOverlay(
    `${game.team1} - ${game.team2}`,
    `
      Result: ${game.goalsTeam1} : ${game.goalsTeam2}, 
      Ball control: ${Math.floor((ballControllA / total) * 100)}% : ${Math.ceil((ballControllB / total) * 100)}%, 
      Guests: ${guests}
     `,
    `${details.log.map(_renderGameLogItem(players)).join('')}`
  )
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
