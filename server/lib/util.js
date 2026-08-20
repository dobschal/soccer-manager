/**
 * @template T
 * @param {Array<T>} array
 * @returns {T}
 */
export function randomItem (array) {
  return array[Math.floor((Math.random() * array.length))]
}

/**
 * Cut a user-supplied string down to `maxLength` **characters** without ever
 * splitting an emoji in half. A plain `str.slice(0, n)` counts UTF-16 code
 * units, so it can cut between the two halves of a surrogate pair and leave a
 * lone surrogate behind — that byte sequence is not valid UTF-8 and MySQL
 * rejects it with ER_TRUNCATED_WRONG_VALUE_FOR_FIELD. MySQL's own VARCHAR(n)
 * limit counts code points as well, so counting them here keeps both sides in
 * agreement.
 *
 * @param {unknown} value
 * @param {number} maxLength - maximum number of code points to keep
 * @returns {string} the truncated string, or '' when `value` is not a string
 */
export function truncateChars (value, maxLength) {
  if (typeof value !== 'string') return ''
  const codePoints = Array.from(value)
  if (codePoints.length <= maxLength) return value
  return codePoints.slice(0, maxLength).join('')
}

/**
 * Number of characters (code points) in a user-supplied string, matching how
 * MySQL counts a VARCHAR length. `String.prototype.length` counts UTF-16 code
 * units, so an emoji would otherwise count as two.
 *
 * @param {string} value
 * @returns {number}
 */
export function charLength (value) {
  return Array.from(value).length
}

/**
 * From: https://javascript.jstruebig.de/skripte/1818/
 *
 * @param {number} teams
 * @returns {Array<Array<[number, number]>}
 */
export function calculateGamePlan (teams) {
  if (!teams || teams < 0) throw new TypeError('Parameter must be greater than zero')
  if (teams % 2) teams++
  let i
  let j
  const result = []
  const teamNumber = []
  for (i = 1; i < teams; i++) teamNumber.push(i)
  for (i = 1; i < teams; i++) {
    const tmp = []
    tmp.push(i % 2 ? [teams, teamNumber[0]] : [teamNumber[0], teams])
    for (j = 1; j < teams / 2; j++) {
      const t1 = teamNumber[j]
      const t2 = teamNumber[teams - j - 1]
      tmp.push(!(j % 2) ? [t1, t2] : [t2, t1])
    }
    result.push(tmp)

    teamNumber.push(teamNumber.shift())
  }
  return result
}

/**
 * @typedef {object} StandingType
 * @property {number} points
 * @property {number} games
 * @property {number} goals
 * @property {number} against
 * @property {number} awayGoals
 * @property {number} wins
 * @property {number} draws
 * @property {number} losses
 * @property {TeamType} team
 */

/**
 * calculate standing for given games. The games should belong to one level and league and should be played.
 * The teams should contain the corresponding teams!
 *
 * @param {GameType[]} games
 * @param {TeamType[]} teams
 * @returns {Array<StandingType>}
 */
export function calculateStanding (games, teams) {
  const standing = {}
  for (const team of teams) {
    standing[team.id] = {
      games: 0,
      points: 0,
      goals: 0,
      against: 0,
      awayGoals: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      team
    }
  }
  for (const game of games) {
    const s1 = standing[game.team_1_id]
    const s2 = standing[game.team_2_id]
    if (!s1 || !s2) continue
    // Forfeit games come in two shapes:
    //  - 0:0 (mid-season league backfill, or both teams below the minimum):
    //    counted as games played but no points/goals/wins/draws/losses.
    //  - 3:0 or 0:3 (one team couldn't field MIN_PLAYERS_TO_PLAY): treated as
    //    a regular win so the opponent receives the 3 points.
    if (game.is_forfeit && game.goals_team_1 === game.goals_team_2) {
      s1.games++
      s2.games++
      continue
    }
    if (game.goals_team_1 > game.goals_team_2) {
      s1.points += 3
      s1.wins++
      s2.losses++
    } else if (game.goals_team_1 < game.goals_team_2) {
      s2.points += 3
      s2.wins++
      s1.losses++
    } else {
      s1.points += 1
      s2.points += 1
      s1.draws++
      s2.draws++
    }
    s1.goals += game.goals_team_1
    s2.goals += game.goals_team_2
    s1.against += game.goals_team_2
    s2.against += game.goals_team_1
    s2.awayGoals += game.goals_team_2
    s1.games++
    s2.games++
  }
  return sortStanding(Object.values(standing), games)
}

/**
 * Order a league table by the DFB tie-break chain (#560):
 *
 *  1. points
 *  2. goal difference
 *  3. goals scored
 *  4. aggregate result of the games between the tied teams (direct comparison)
 *  5. away goals scored in those direct games
 *  6. away goals scored overall
 *
 * The official chain ends with a play-off on neutral ground, which a simulated
 * league has no room for, so a group that is still tied after all six criteria
 * falls back to the team id. That keeps the order stable across requests and
 * across `standing_cache` entries instead of depending on row order.
 *
 * Criteria 4 and 5 are only defined *within* a tied group, so they cannot live
 * in a plain comparator: with three or more tied teams a pairwise head-to-head
 * comparison is not transitive and `Array#sort` would return an order that
 * depends on the input sequence. Rows are therefore grouped by the global
 * criteria (1-3) first and every group is then resolved against its own mini
 * table, which is how the DFB rules read.
 *
 * @param {Array<StandingType>} rows
 * @param {GameType[]} games - the same league games the rows were built from
 * @returns {Array<StandingType>}
 */
export function sortStanding (rows, games = []) {
  const sorted = [...rows].sort(_compareOverall)
  const result = []
  let start = 0
  while (start < sorted.length) {
    let end = start + 1
    while (end < sorted.length && _compareOverall(sorted[start], sorted[end]) === 0) end++
    const group = sorted.slice(start, end)
    result.push(...(group.length > 1 ? _resolveTiedGroup(group, games) : group))
    start = end
  }
  return result
}

/**
 * Criteria 1-3: points, goal difference, goals scored. Two rows that compare
 * equal here are tied as far as the league-wide numbers go.
 * @param {StandingType} s1
 * @param {StandingType} s2
 * @returns {number}
 */
function _compareOverall (s1, s2) {
  if (s2.points !== s1.points) return s2.points - s1.points
  const diff = (s2.goals - s2.against) - (s1.goals - s1.against)
  if (diff !== 0) return diff
  return s2.goals - s1.goals
}

/**
 * Criteria 4-6 for a group of teams that are level on points, goal difference
 * and goals scored: a mini table built from the games the tied teams played
 * against each other, then away goals overall, then the team id.
 * @param {Array<StandingType>} group
 * @param {GameType[]} games
 * @returns {Array<StandingType>}
 */
function _resolveTiedGroup (group, games) {
  // Keyed by String so a numeric team id and its BIGINT string form still
  // match up, the same way `standing[game.team_1_id]` does above.
  const direct = new Map(group.map(s => [String(s.team.id), { goals: 0, against: 0, awayGoals: 0 }]))
  for (const game of games) {
    const home = direct.get(String(game.team_1_id))
    const away = direct.get(String(game.team_2_id))
    if (!home || !away) continue
    // Same skip as in `calculateStanding`: a 0:0 forfeit produced no result.
    if (game.is_forfeit && game.goals_team_1 === game.goals_team_2) continue
    home.goals += game.goals_team_1
    home.against += game.goals_team_2
    away.goals += game.goals_team_2
    away.against += game.goals_team_1
    away.awayGoals += game.goals_team_2
  }
  return [...group].sort((s1, s2) => {
    const d1 = direct.get(String(s1.team.id))
    const d2 = direct.get(String(s2.team.id))
    const diff = (d2.goals - d2.against) - (d1.goals - d1.against)
    if (diff !== 0) return diff
    if (d2.awayGoals !== d1.awayGoals) return d2.awayGoals - d1.awayGoals
    if ((s2.awayGoals ?? 0) !== (s1.awayGoals ?? 0)) return (s2.awayGoals ?? 0) - (s1.awayGoals ?? 0)
    return Number(s1.team.id) - Number(s2.team.id)
  })
}
