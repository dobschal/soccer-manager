import { query } from './lib/database.js'

// 1. Check Tactic (/)
// 2. Play Action Cards --> !!! not possible because action cards are hanging on user...
// 3. Choose Sponsor
// 4. Expand Stadium
// 5. Trade Players

export async function makeBotMoves () {
  /** @type {TeamType[]} */
  const botTeams = await query('SELECT * FROM team WHERE user_id IS NULL')
  const botTeamIds = botTeams.map(t => t.id).join(', ')
  /** @type {PlayerType[]} */
  const players = await query(`SELECT * FROM player WHERE id IN (${botTeamIds})`)
  for (const botTeam of botTeams) {
    const isStrongTeam = botTeam.id % 2 === 0
    const playersOfTeam = players.filter(p => p.team_id === botTeam.id)
    await _checkTactic(botTeam, playersOfTeam, isStrongTeam)
  }
}

/**
 *
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @param {boolean} isStrongTeam
 * @private
 */
async function _checkTactic (botTeam, players, isStrongTeam) {
  const promises = []
  for (const player of players.filter(p => p.in_game_position)) {
    const p2 = players.find(p2 => p2.id !== player.id &&
      !p2.in_game_position &&
      p2.position === player.position &&
      (p2.level > player.level || !isStrongTeam))
    if (!p2) continue
    console.log(`${botTeam.name} is exchanging player ${player.name} (${player.level}) with ${p2.name} (${p2.level}), strong bot?: ${isStrongTeam}`)
    p2.in_game_position = p2.position
    player.in_game_position = null
    promises.push(query('UPDATE player SET in_game_position=? WHERE id=?', [p2.in_game_position, p2.id]))
    promises.push(query('UPDATE player SET in_game_position=? WHERE id=?', [player.in_game_position, player.id]))
  }
  await Promise.all(promises)
}
