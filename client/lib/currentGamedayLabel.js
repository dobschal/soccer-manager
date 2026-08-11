import { t } from '../i18n/index.js'

/**
 * Build the user-facing label for the current game day in the info bar.
 *
 * Priority:
 *  1. Cup round scheduled today → cup round name
 *  2. League match day for the user's league is happening today → "Tag X"
 *  3. User has an upcoming league match day → "Tag X" (next)
 *  4. Season has ended (no unplayed games anywhere) → "Saisonende"
 *  5. Fallback to internal counter
 *
 * @param {{
 *   gameDay: number,
 *   season: number,
 *   cupRoundToday?: {cupRound: number, totalRounds: number}|null,
 *   userMatchDayToday?: number|null,
 *   userNextMatchDay?: number|null,
 *   isSeasonEnd?: boolean
 * }} data
 * @returns {string}
 */
export function currentGamedayLabel (data) {
  if (data.cupRoundToday) {
    const { cupRound, totalRounds } = data.cupRoundToday
    if (cupRound === 1) return t('cup.final')
    if (cupRound === 2) return t('cup.semiFinal')
    if (cupRound === 4) return t('cup.quarterFinal')
    if (cupRound === 8) return t('cup.roundOf16')
    const number = (totalRounds || 0) - Math.log2(cupRound)
    return t('cup.roundNumber', { number })
  }
  const matchDay = data.userMatchDayToday ?? data.userNextMatchDay
  if (matchDay) {
    return t('nav.day', { gameDay: matchDay })
  }
  if (data.isSeasonEnd) {
    return t('nav.seasonEnd')
  }
  return t('nav.day', { gameDay: (data.gameDay ?? 0) + 1 })
}

/**
 * The results-page link behind the info-bar label. It has to target exactly the
 * day the label names — without the query params the results page falls back to
 * the *last played* match day, so a label reading "Tag 9" opened match day 8.
 *
 * Mirrors the priorities of `currentGamedayLabel`: a cup round opens the cup
 * tab, a league match day opens that match day, anything else the default view.
 * @param {Parameters<typeof currentGamedayLabel>[0]} data
 * @returns {string}
 */
export function currentGamedayHref (data) {
  if (data.cupRoundToday) {
    return '#results?sub_page=cup'
  }
  const matchDay = data.userMatchDayToday ?? data.userNextMatchDay
  if (matchDay && typeof data.season === 'number') {
    return `#results?season=${data.season}&match_day=${matchDay}`
  }
  return '#results'
}
