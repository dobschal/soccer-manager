/**
 * Regenerate `server/data/formationMatchups.js`.
 *
 * Why simulate instead of aggregating production games: a formation pairing in
 * prod is confounded by squad strength, home advantage and manager engagement
 * (see the placebo test in the balancing notes — merely having a team
 * description "explains" +0.28 PPG). Simulation isolates the formation: both
 * sides get eleven identical players, identical tactics, and only the shape
 * differs, so what comes out is the causal effect of the pairing.
 *
 * Usage:
 *   node scripts/generate-formation-matchups.mjs [--games 2000] [--level 32]
 */

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { kickoff, playGameStep } from '../server/play-game.js'
import { getPositionsOfFormation } from '../client/util/formation.js'

const FORMATIONS = ['352', '343a', '343b', '451a', '451b', '442a', '442b', '433', '541', '532']

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(args[i + 1])
}
const GAMES = argValue('games', 2000)
// 11 x 32 ≈ 350 lineup strength, which is where prod squads sit.
const LEVEL = argValue('level', 32)

// The engine logs every kickoff; 200k matches of that is noise.
console.log = () => {}

let nextId = 1

/**
 * Eleven identical players in their natural positions.
 * @param {string} formation
 * @returns {{team: object, players: Array<object>}}
 */
function makeTeam (formation) {
  const teamId = nextId + 1000000
  const players = getPositionsOfFormation(formation).map((pos, i) => ({
    id: nextId++,
    name: `${pos}_${i}`,
    level: LEVEL,
    position: pos,
    in_game_position: pos,
    freshness: 1,
    team_id: teamId,
    hasBall: false,
    is_suspended: false
  }))
  const team = {
    id: teamId,
    name: formation,
    play_style: 'normal',
    pass_style: 'mixed',
    attack_mode: 'balanced',
    formation
  }
  return { team, players }
}

/**
 * @param {{team: object, players: Array<object>}} a
 * @param {{team: object, players: Array<object>}} b
 * @returns {{goalsA: number, goalsB: number}}
 */
function simulate (a, b) {
  const playerTeamA = a.players.map(p => ({ ...p, hasBall: false, sentOff: false, yellowCardsInMatch: 0 }))
  const playerTeamB = b.players.map(p => ({ ...p, hasBall: false, sentOff: false, yellowCardsInMatch: 0 }))
  const gameDetails = {
    log: [],
    goalsTeamA: 0,
    goalsTeamB: 0,
    strengthTeamA: playerTeamA.reduce((sum, p) => sum + p.level, 0),
    strengthTeamB: playerTeamB.reduce((sum, p) => sum + p.level, 0),
    stadiumDetails: {},
    playerTeamA,
    playerTeamB,
    teamA: a.team,
    teamB: b.team
  }
  kickoff(playerTeamA, playerTeamB, gameDetails)
  for (let step = 0; step < 900; step++) {
    gameDetails.currentMinute = Math.floor(step / 10)
    playGameStep(playerTeamA, playerTeamB, gameDetails)
  }
  return { goalsA: gameDetails.goalsTeamA, goalsB: gameDetails.goalsTeamB }
}

const ppg = {}
for (const a of FORMATIONS) ppg[a] = {}

const started = Date.now()
for (const a of FORMATIONS) {
  for (const b of FORMATIONS) {
    let points = 0
    for (let i = 0; i < GAMES; i++) {
      const { goalsA, goalsB } = simulate(makeTeam(a), makeTeam(b))
      if (goalsA > goalsB) points += 3
      else if (goalsA === goalsB) points += 1
    }
    ppg[a][b] = points / GAMES
  }
  process.stderr.write(`${a} done (${Math.round((Date.now() - started) / 1000)}s)\n`)
}

// The raw PPG of a mirror pairing is not 1.5 but ~1.3, because draws pay one
// point instead of one and a half. Taking the antisymmetric part removes that
// baseline (and any residual home/away asymmetry) and leaves the pure edge.
// Rounding each direction separately would break the antisymmetry on a tie
// (Math.round(12.5) is 13, Math.round(-12.5) is -12), so one direction is
// rounded and the other mirrored from it.
const advantage = {}
for (const a of FORMATIONS) advantage[a] = {}
for (let i = 0; i < FORMATIONS.length; i++) {
  const a = FORMATIONS[i]
  advantage[a][a] = 0
  for (let j = i + 1; j < FORMATIONS.length; j++) {
    const b = FORMATIONS[j]
    const edge = Math.round(((ppg[a][b] - ppg[b][a]) / 2) * 100) / 100
    advantage[a][b] = edge
    advantage[b][a] = -edge
  }
}

const body = `/**
 * Formation-versus-formation edge, in league points per game. Generated file —
 * do not edit by hand, run \`node scripts/generate-formation-matchups.mjs\`.
 *
 * \`FORMATION_MATCHUPS[a][b]\` is what a team playing formation \`a\` gains (or
 * loses) per game against a team playing formation \`b\`, with both squads
 * otherwise identical. Positive means \`a\` is favoured. The table is
 * antisymmetric: \`[a][b] === -[b][a]\`, and the diagonal is 0.
 *
 * ${GAMES.toLocaleString('en-US')} simulated matches per ordered pairing (${(FORMATIONS.length * FORMATIONS.length * GAMES).toLocaleString('en-US')} in total),
 * eleven identical players of level ${LEVEL} per side, all tactics on their defaults.
 * The standard error of a single cell is about ${(1.2 / Math.sqrt(GAMES) / Math.SQRT2).toFixed(3)} points, so anything
 * past ±0.06 is real.
 *
 * Where the effect comes from: \`_fightsOpponents\` in \`server/play-game.js\`
 * pairs a ball carrier against opponents at the counter position
 * (\`determineOponentPosition\`: CM↔CM, DM↔OM, CD↔CA, …). If the opponent
 * fields nobody there the carrier advances unopposed, and every extra player
 * at the counter position is one more duel to survive. So a DM/OM shape meets
 * a CM shape with holes on both sides, and a back five puts three CDs in front
 * of a lone CA.
 *
 * Re-run the generator whenever that pairing logic, the duel maths or the
 * available formations change — the numbers are a snapshot of the engine, not
 * a design decision.
 */
export const FORMATION_MATCHUPS = ${JSON.stringify(advantage, null, 2)}
`

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '..', 'server', 'data', 'formationMatchups.js')
await writeFile(target, body)
process.stderr.write(`\nWrote ${target}\n`)
