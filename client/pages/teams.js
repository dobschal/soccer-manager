import { queryApi } from '../lib/gateway.js'

export async function renderTeamsPage () {
  const teams = await fetchTeams()
  return `
    <div class="mb-4">
      Got ${teams.length} teams<br>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Name</th>
          <th scope="col">League</th>
        </tr>
      </thead>
      <tbody>
          ${teams.map(renderTeamListItem).join('')}
      </tbody>
    </table>
  `
}

function renderTeamListItem (team) {
  return `
    <tr>
      <th scope="row">${team.id}</th>
      <td>${team.name}</td>
      <td>${team.level}</td>
    </tr>
  `
}

async function fetchTeams () {
  return await queryApi('SELECT * FROM team')
}
