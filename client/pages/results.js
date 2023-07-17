import { onClick } from '../lib/htmlEventHandlers.js'
import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { getQueryParams, goTo, setQueryParams } from '../lib/router.js'
import { showOverlay } from '../partials/overlay.js'

let myTeamId

export async function renderResultsPage () {
  const info = await server.getMyTeam()
  myTeamId = info.team.id
  const { season, gameDay } = await getSeasonAndGameDay()
  const { results } = await server.getResults({ season, gameDay })
  const standing = await server.getStanding({ season, gameDay })
  console.log('Standing: ', standing)

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

  return `
    <div class="mb-4">
      <h2>Results</h2>
      <p>
        <b>Season</b>: ${season}<br>
        <b>Game day</b>: 
          <span id="prev-game-day-button" class="fa fa-chevron-left fa-button"></span> 
          ${gameDay} 
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
        <th scope="col">Goals</th>
        <th scope="col">Diff</th>
        <th scope="col">Points</th>        
      </tr>
    </thead>
    <tbody>
      ${standing.sort(_sortStanding).map(_renderStandingListItem).join('')}
    </tbody>
  </table>
  `
}

function _renderStandingListItem (standingItem, index) {
  const id = generateId()

  onClick('#' + id, () => goTo(`team?id=${standingItem.team.id}`))

  return `
    <tr id="${id}" class="${myTeamId === standingItem.team.id ? 'table-info' : ''}">
      <td>${index + 1}.</td>
      <td>${standingItem.team.name}</td>
      <td>${standingItem.games}</td>
      <td>${standingItem.goals}:${standingItem.against}</td>
      <td>${standingItem.goals - standingItem.against}</td>
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

function _showGameModal (game) {
  console.log(JSON.parse(game.details))
  showOverlay(
    `${game.team1} - ${game.team2}`,
    `${game.goalsTeam1}:${game.goalsTeam2}`,
    'TODO...'
  )
}
