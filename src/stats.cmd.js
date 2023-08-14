import { query } from './lib/database.js'

async function run () {
  const games = await query('SELECT * FROM game WHERE played=1')
  let totalGoalChances = 0
  for (const game of games) {
    const gameDetails = JSON.parse(game.details)
    let goalChances = 0
    for (const logItem of gameDetails.log) {
      if (logItem.keeperHolds || logItem.goal) {
        goalChances++
      }
    }
    totalGoalChances += goalChances
  }
  const averageGoalChances = (totalGoalChances / games.length).toFixed(2)
  console.log('Average goal changes per game: ', averageGoalChances)
}

run()
