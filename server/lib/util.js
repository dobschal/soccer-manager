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
    s1.games++
    s2.games++
  }
  return Object.values(standing).sort(_sortStanding)
}

/**
 * @param {StandingType} s1
 * @param {StandingType} s2
 * @returns {number}
 */
function _sortStanding (s1, s2) {
  const retVal = s2.points - s1.points
  if (retVal === 0) {
    return (s2.goals - s2.against) - (s1.goals - s1.against)
  }
  return retVal
}
