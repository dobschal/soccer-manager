import { describe, expect, it } from 'vitest'
import { calculateStanding } from '../../lib/util.js'

/**
 * Tie-break chain from #560 (DFB / Bundesliga rules):
 *   1. points
 *   2. goal difference
 *   3. goals scored
 *   4. aggregate result of the direct games
 *   5. away goals in the direct games
 *   6. away goals overall
 * A play-off (official rule 6) is replaced by the team id as a stable fallback.
 */
describe('league table tie-breaks (#560)', () => {
  const team = id => ({ id, name: `Team ${id}` })

  function game (team1Id, team2Id, goals1, goals2, opts = {}) {
    return {
      team_1_id: team1Id,
      team_2_id: team2Id,
      goals_team_1: goals1,
      goals_team_2: goals2,
      level: 0,
      league: 0,
      game_type: 'league',
      played: 1,
      ...opts
    }
  }

  const order = standing => standing.map(s => s.team.id)

  it('orders by points first', () => {
    const teams = [team(1), team(2)]
    const standing = calculateStanding([game(1, 2, 0, 1)], teams)
    expect(order(standing)).toEqual([2, 1])
  })

  it('orders by goal difference when points are level', () => {
    const teams = [team(1), team(2), team(3), team(4)]
    // 1 and 2 both win once: 1 by three goals, 2 by one.
    const games = [game(1, 3, 3, 0), game(2, 4, 1, 0)]
    const standing = calculateStanding(games, teams)
    expect(order(standing).slice(0, 2)).toEqual([1, 2])
  })

  it('prefers the team with more goals scored on equal points and goal difference', () => {
    const teams = [team(1), team(2), team(3), team(4)]
    // Both win by two, but team 2 scored four goals against team 1's two.
    const games = [game(1, 3, 2, 0), game(2, 4, 4, 2)]
    const standing = calculateStanding(games, teams)
    expect(order(standing).slice(0, 2)).toEqual([2, 1])
  })

  it('reproduces the Jena/Besiktas case from the ticket', () => {
    // Same points and same goal difference, more goals scored decides.
    const jena = team(11)
    const besiktas = team(4)
    const teams = [jena, besiktas, team(20), team(21)]
    const games = [
      game(jena.id, 20, 4, 2),
      game(besiktas.id, 21, 2, 0)
    ]
    const standing = calculateStanding(games, teams)
    // Without criterion 2 the lower team id (Besiktas) came out on top.
    expect(order(standing).slice(0, 2)).toEqual([jena.id, besiktas.id])
  })

  it('falls back to the aggregate result of the direct games', () => {
    const teams = [team(1), team(2), team(3), team(4)]
    // 1 and 2 end up level on points, goal difference and goals scored, but
    // team 2 won the direct encounter 3:1 on aggregate.
    const games = [
      game(1, 2, 0, 2),
      game(2, 1, 1, 1),
      game(1, 3, 2, 0),
      game(4, 1, 1, 0),
      game(3, 2, 1, 0),
      game(2, 4, 0, 2)
    ]
    const standing = calculateStanding(games, teams)
    const one = standing.find(s => s.team.id === 1)
    const two = standing.find(s => s.team.id === 2)
    expect(one.points).toBe(two.points)
    expect(one.goals - one.against).toBe(two.goals - two.against)
    expect(one.goals).toBe(two.goals)
    expect(standing.indexOf(two)).toBeLessThan(standing.indexOf(one))
  })

  it('uses away goals of the direct games when the aggregate is level', () => {
    const teams = [team(1), team(2)]
    // 1:2 away and 2:1 at home for team 1 → level everywhere, but team 1
    // scored two away goals against team 2's one.
    const games = [
      game(2, 1, 1, 2),
      game(1, 2, 2, 1)
    ]
    const standing = calculateStanding(games, teams)
    expect(order(standing)).toEqual([1, 2])
  })

  it('uses away goals overall when even the direct games are level', () => {
    const teams = [team(1), team(2), team(3), team(4)]
    // Teams 1 and 2 never met. Both won 2:0 at home and lost 0:2 away, but
    // team 2 also drew 1:1 away while team 1 drew 1:1 at home.
    const games = [
      game(1, 3, 2, 0),
      game(4, 1, 2, 0),
      game(1, 4, 1, 1),
      game(2, 3, 2, 0),
      game(4, 2, 2, 0),
      game(3, 2, 1, 1)
    ]
    const standing = calculateStanding(games, teams)
    const one = standing.find(s => s.team.id === 1)
    const two = standing.find(s => s.team.id === 2)
    expect(one.points).toBe(two.points)
    expect(one.goals).toBe(two.goals)
    expect(two.awayGoals).toBeGreaterThan(one.awayGoals)
    expect(standing.indexOf(two)).toBeLessThan(standing.indexOf(one))
  })

  it('falls back to the team id when every criterion is level', () => {
    const teams = [team(7), team(3)]
    const standing = calculateStanding([game(7, 3, 1, 1), game(3, 7, 1, 1)], teams)
    expect(order(standing)).toEqual([3, 7])
  })

  it('resolves a three-way tie from the mini table, independent of input order', () => {
    // 1 beat 2, 2 beat 3, 3 beat 1 — but with different margins, so the mini
    // table separates them. A pairwise head-to-head comparator would return a
    // different order depending on how the rows arrive.
    const games = [
      game(1, 2, 3, 0),
      game(2, 3, 2, 0),
      game(3, 1, 1, 0),
      game(1, 4, 0, 3),
      game(2, 4, 0, 2),
      game(3, 4, 0, 1)
    ]
    const forward = order(calculateStanding(games, [team(1), team(2), team(3), team(4)]))
    const reversed = order(calculateStanding(games, [team(4), team(3), team(2), team(1)]))
    expect(forward).toEqual(reversed)
  })

  it('ignores 0:0 forfeits in the direct comparison', () => {
    const teams = [team(1), team(2)]
    const games = [
      game(1, 2, 0, 0, { is_forfeit: 1 }),
      game(2, 1, 0, 2)
    ]
    const standing = calculateStanding(games, teams)
    expect(order(standing)).toEqual([1, 2])
    expect(standing.find(s => s.team.id === 2).points).toBe(0)
  })
})
