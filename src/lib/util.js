/**
 * @template T
 * @param {Array<T>} array
 * @returns {T}
 */
export function randomItem (array) {
  return array[Math.floor((Math.random() * array.length))]
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
  let i; let j; const result = []; const teamNumber = []
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
 * @typedef {Object} StandingType
 * @property {number} points
 * @property {number} games
 * @property {number} goals
 * @property {number} against
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
      team
    }
  }
  for (const game of games) {
    if (game.goals_team_1 > game.goals_team_2) {
      standing[game.team_1_id].points += 3
    } else if (game.goals_team_1 < game.goals_team_2) {
      standing[game.team_2_id].points += 3
    } else {
      standing[game.team_1_id].points += 1
      standing[game.team_2_id].points += 1
    }
    standing[game.team_1_id].goals += game.goals_team_1
    standing[game.team_2_id].goals += game.goals_team_2
    standing[game.team_1_id].against += game.goals_team_2
    standing[game.team_2_id].against += game.goals_team_1
    standing[game.team_1_id].games++
    standing[game.team_2_id].games++
  }
  return Object.values(standing).sort(_sortStanding)
}

function _sortStanding (s1, s2) {
  const retVal = s2.points - s1.points
  if (retVal === 0) {
    return (s2.goals - s2.against) - (s1.goals - s1.against)
  }
  return retVal
}
