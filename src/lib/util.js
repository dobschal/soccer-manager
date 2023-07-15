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
