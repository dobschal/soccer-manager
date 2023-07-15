import { queryApi } from './lib/gateway.js'

console.log('Application started...')

async function fetchTeams () {
  const teams = await queryApi('SELECT * FROM team')
  console.log('Teams: ', teams)
}

fetchTeams()
