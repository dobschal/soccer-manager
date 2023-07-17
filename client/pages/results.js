import { onClick } from '../lib/eventHandlers.js'
import { server } from '../lib/gateway.js'
import { render } from '../lib/render.js'

export async function renderResultsPage (season, gameDay) {
  if (typeof season === 'undefined' && typeof gameDay === 'undefined') {
    const response = await server.getCurrentGameday()
    season = response.season; gameDay = response.gameDay
  }
  if (gameDay > 33) gameDay = 33
  if (gameDay < 0) gameDay = 0
  const { results } = await server.getResults({ season, gameDay })

  onClick('#prev-game-day-button', async () => {
    render('#page', await renderResultsPage(season, gameDay - 1))
  })

  onClick('#next-game-day-button', async () => {
    render('#page', await renderResultsPage(season, gameDay + 1))
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
    <table class="table">
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
  `
}

function _renderResultListItem (result) {
  return `
  <tr>
    <td>${result.team1}</td>
    <td>${result.team2}</td>
    <td>${result.goalsTeam1 ?? '-'} : ${result.goalsTeam1 ?? '-'}</td>
  </tr>
  `
}
