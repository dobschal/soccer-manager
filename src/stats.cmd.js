import { query } from './lib/database.js'

async function run () {
  const games = await query('SELECT * FROM game WHERE played=1 AND season=5 AND game_day>=30')
  let totalGoalChances = 0
  let totalPasses = 0
  let totalFights = 0
  let totalGoals = 0
  let maxGoalsInGame = 0
  for (const game of games) {
    totalGoals += game.goals_team_1 + game.goals_team_2
    if (maxGoalsInGame < game.goals_team_1) maxGoalsInGame = game.goals_team_1
    if (maxGoalsInGame < game.goals_team_2) maxGoalsInGame = game.goals_team_2
    const gameDetails = JSON.parse(game.details)
    let goalChances = 0
    let passes = 0
    let fights = 0
    for (const logItem of gameDetails.log) {
      if (logItem.keeperHolds || logItem.goal) {
        goalChances++
      }
      if (logItem.pass) {
        passes++
      }
      if (typeof logItem.lostBall === 'boolean') {
        fights++
      }
    }
    totalGoalChances += goalChances
    totalPasses += passes
    totalFights += fights
  }
  const averageGoalChances = (totalGoalChances / games.length).toFixed(2)
  const averagePasses = (totalPasses / games.length).toFixed(2)
  const averageFights = (totalFights / games.length).toFixed(2)
  const averageGoals = (totalGoals / games.length).toFixed(2)
  console.log('Average goal chances per game: ', averageGoalChances)
  console.log('Average passes per game: ', averagePasses)
  console.log('Average fights per game: ', averageFights)
  console.log('Average goals per game: ', averageGoals)
  console.log('Max goals in game by team: ', maxGoalsInGame)
  process.exit(0)
}

run()
