/**
 * Game days are played by the server CRON at 00:00 and 12:00 **UTC**. Anything
 * that counts down to the next game day — or expires with it — has to derive
 * that boundary in UTC, otherwise the result is wrong for every user outside
 * the UTC timezone (#448). Shared by the client (countdowns) and the server
 * (spy-report validity).
 *
 * @param {Date|string|number} [from] - reference point, defaults to now
 * @returns {Date} the next 00:00/12:00 UTC boundary strictly after `from`
 */
export function getNextGameDayDate (from = new Date()) {
  const reference = from instanceof Date ? from : new Date(from)
  const next = new Date(reference.getTime())
  if (reference.getUTCHours() < 12) {
    next.setUTCHours(12, 0, 0, 0)
  } else {
    next.setUTCDate(next.getUTCDate() + 1)
    next.setUTCHours(0, 0, 0, 0)
  }
  return next
}
