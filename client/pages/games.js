import { queryApi } from '../lib/gateway.js'

export async function renderGamesPage () {
  const games = await fetchGames()
  return `
    <h1>Soccer Simulation</h1>
    <div>
      Got ${games.length} games<br>
      <a href="#">teams</a>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Team 1</th>
          <th scope="col">Team 2</th>
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
      <th scope="row">${game.id}</th>
      <td>${game.team_1_id}</td>
      <td>${game.team_2_id}</td>
    </tr>
  `
}

async function fetchGames () {
  return await queryApi('SELECT * FROM game')
}
