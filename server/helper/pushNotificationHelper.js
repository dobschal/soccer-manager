import { query } from '../lib/database.js'
import { sendPushNotifications } from '../lib/pushNotification.js'

const translations = {
  en: {
    gameDayTitle: 'Game Day Played! \u26BD',
    leagueBody: (season, matchDay) => `Season ${season + 1}, Game Day ${matchDay} results are in!`,
    cupBody: (season, matchDay) => `Season ${season + 1}, Cup Round ${matchDay} results are in!`
  },
  de: {
    gameDayTitle: 'Spieltag gespielt! \u26BD',
    leagueBody: (season, matchDay) => `Saison ${season + 1}, Spieltag ${matchDay} Ergebnisse sind da!`,
    cupBody: (season, matchDay) => `Saison ${season + 1}, Pokalrunde ${matchDay} Ergebnisse sind da!`
  }
}

/**
 * @param {string} language
 * @returns {typeof translations.en}
 */
function getTranslation (language) {
  return translations[language] || translations.en
}

/**
 * Resolve the displayed (1-based) match day for a played game day. The
 * internal `game_day` counter is monotonic across cup *and* league days, so
 * the user-facing label needs the `match_day` column from the game row.
 * League is preferred over cup when both exist on the same day (which
 * normally doesn't happen).
 *
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<{matchDay: number, kind: 'league'|'cup'} | null>}
 */
async function _resolveDisplayMatchDay (gameDay, season) {
  const [leagueGame] = await query(
    `SELECT match_day FROM game
      WHERE season=? AND game_day=? AND played=1
        AND (game_type='league' OR game_type IS NULL)
        AND match_day IS NOT NULL
      LIMIT 1`,
    [season, gameDay]
  )
  if (leagueGame) return { matchDay: leagueGame.match_day, kind: 'league' }
  const [cupGame] = await query(
    `SELECT match_day FROM game
      WHERE season=? AND game_day=? AND played=1
        AND game_type='cup' AND match_day IS NOT NULL
      LIMIT 1`,
    [season, gameDay]
  )
  if (cupGame) return { matchDay: cupGame.match_day, kind: 'cup' }
  return null
}

/**
 * Send push notifications to all users (iOS + Android) after a game day is calculated
 * @param {number} gameDay
 * @param {number} season
 */
export async function sendGameDayPushNotifications (gameDay, season) {
  try {
    const display = await _resolveDisplayMatchDay(gameDay, season)
    if (!display) return

    const users = await query(
      `SELECT DISTINCT dt.user_id, COALESCE(u.language, 'en') as language
       FROM device_token dt
                JOIN user u ON u.id = dt.user_id
       WHERE dt.platform IN ('ios', 'android')`
    )
    if (!users.length) return

    const byLanguage = {}
    for (const user of users) {
      const lang = user.language || 'en'
      if (!byLanguage[lang]) byLanguage[lang] = []
      byLanguage[lang].push(user.user_id)
    }

    for (const [lang, userIds] of Object.entries(byLanguage)) {
      const t = getTranslation(lang)
      const body = display.kind === 'cup'
        ? t.cupBody(season, display.matchDay)
        : t.leagueBody(season, display.matchDay)
      await sendPushNotifications(
        userIds,
        t.gameDayTitle,
        body,
        {
          type: 'GAME_DAY',
          gameDay,
          season,
          matchDay: display.matchDay,
          kind: display.kind
        }
      )
    }
  } catch (e) {
    console.error('[Push] Error sending game day notifications:', e)
  }
}
