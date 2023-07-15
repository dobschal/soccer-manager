import { onClick } from '../lib/eventHandlers.js'
import { queryApi } from '../lib/gateway.js'
import { renderPage } from '../lib/renderPage.js'

export async function renderGamesPage (season, gameDay) {
  if (typeof season === 'undefined' || typeof gameDay === 'undefined') {
    const response = await fetchCurrentGameDay()
    season = response.season
    gameDay = response.gameDay
  }
  const games = await fetchGamesOfGameDay({ season, gameDay })

  onClick('#next', async () => {
    renderPage(await renderGamesPage(season, gameDay + 1))
  })

  onClick('#prev', async () => {
    renderPage(await renderGamesPage(season, gameDay - 1))
  })

  return `
    <h1>Soccer Simulation</h1>
    <div>
      Got ${games.length} games  for game day ${gameDay} in season ${season}<br>
      <button id="prev">Prev</button>
      <button id="next">Next</button>
      <a href="#">teams</a>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th scope="col">Team 1</th>
          <th scope="col">Team 2</th>
          <th scope="col">Result</th>
        </tr>
      </thead>
      <tbody>
          ${games.map(renderGameListItem).join('')}
      </tbody>
    </table>
  `
}

function renderGameListItem (game) {
  return `
    <tr>
      <td>${game.team_a_name}</td>
      <td>${game.team_b_name}</td>
      <td>${game.goals_team_1 ?? '-'}:${game.goals_team_2 ?? '-'}</td>
    </tr>
  `
}

async function fetchCurrentGameDay () {
  const [{ season, game_day: gameDay }] = await queryApi('SELECT * FROM game WHERE played=1 ORDER BY season DESC, game_day DESC LIMIT 1')
  return { season, gameDay }
}

async function fetchGamesOfGameDay ({ season, gameDay }) {
  return await queryApi(`
    SELECT 
      g.id as id, 
      g.played as played,
      team_a.name as team_a_name,
      team_b.name as team_b_name,
      g.goals_team_1 as goals_team_1,
      g.goals_team_2 as goals_team_2
    FROM game g 
    JOIN team team_a ON team_a.id=g.team_1_id
    JOIN team team_b ON team_b.id=g.team_2_id
    WHERE g.game_day=${gameDay} AND g.season=${season}
  `)
}
