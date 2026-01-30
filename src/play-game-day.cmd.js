import { calculateGames } from './play-game-day.js'

/**
 * @returns {Promise<void>}
 */
async function run () {
    await calculateGames()
  process.exit(0)
}
run()
