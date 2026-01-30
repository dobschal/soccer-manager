import { calculateGames } from './play-game-day.js'

/**
 * @returns {Promise<void>}
 */
async function run () {
  const amountOfGamesToPlay = 10
  for (let i = 0; i < amountOfGamesToPlay; i++) {
    await calculateGames()
  }
  process.exit(0)
}
run()
