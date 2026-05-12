import { t } from '../i18n/index.js'

/**
 * Build the user-facing label for the current game day in the info bar.
 *
 * Priority:
 *  1. Cup round scheduled today → cup round name
 *  2. League match day for the user's league is happening today → "Spieltag X"
 *  3. User has an upcoming league match day → "Spieltag X" (next)
 *  4. Fallback to internal counter
 *
 * @param {{
 *   gameDay: number,
 *   season: number,
 *   cupRoundToday?: {cupRound: number, totalRounds: number}|null,
 *   userMatchDayToday?: number|null,
 *   userNextMatchDay?: number|null
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
    return t('nav.day', { gameDay: matchDay, season: (data.season ?? 0) + 1 })
  }
  return t('nav.day', { gameDay: (data.gameDay ?? 0) + 1, season: (data.season ?? 0) + 1 })
}
