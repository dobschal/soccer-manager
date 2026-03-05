import { query } from '../lib/database.js'
import { sendPushNotifications } from '../lib/pushNotification.js'

const translations = {
  en: {
    gameDayTitle: 'Game Day Played! \u26BD',
    gameDayBody: (season, gameDay) => `Season ${season + 1}, Game Day ${gameDay + 1} results are in!`
  },
  de: {
    gameDayTitle: 'Spieltag gespielt! \u26BD',
    gameDayBody: (season, gameDay) => `Saison ${season + 1}, Spieltag ${gameDay + 1} Ergebnisse sind da!`
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
 * Send push notifications to all iOS users after a game day is calculated
 * @param {number} gameDay
 * @param {number} season
 */
export async function sendGameDayPushNotifications (gameDay, season) {
  try {
    const users = await query(
      `SELECT DISTINCT dt.user_id, COALESCE(u.language, 'en') as language
       FROM device_token dt
                JOIN user u ON u.id = dt.user_id
       WHERE dt.platform = 'ios'`
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
      await sendPushNotifications(
        userIds,
        t.gameDayTitle,
        t.gameDayBody(season, gameDay),
        {
          type: 'GAME_DAY',
          gameDay,
          season
        }
      )
    }
  } catch (e) {
    console.error('[Push] Error sending game day notifications:', e)
  }
}
