import { t } from '../i18n/index.js'

const LABEL_KEYS = {
  LEVEL_UP_PLAYER_40: 'actionCards.type.basicPromotion',
  LEVEL_UP_PLAYER_70: 'actionCards.type.epicAdvancement',
  LEVEL_UP_PLAYER_100: 'actionCards.type.legendaryMastery',
  FRESHNESS_5: 'actionCards.type.quickRecovery',
  FRESHNESS_10: 'actionCards.type.energyBoost',
  FRESHNESS_20: 'actionCards.type.fullRecovery',
  NEW_YOUTH_PLAYER_1: 'actionCards.type.youthProspect1',
  NEW_YOUTH_PLAYER_2: 'actionCards.type.youthProspect2',
  NEW_YOUTH_PLAYER_3: 'actionCards.type.youthProspect3',
  BONUS_100K: 'actionCards.type.cashBonus',
  MILLION_BONUS: 'actionCards.type.millionBonus',
  STAR_PLAYER: 'actionCards.type.starPlayer',
  MOTIVATING_SPEECH: 'actionCards.type.motivatingSpeech',
  SPY: 'actionCards.type.spy',
  MEDICAL_TREATMENT: 'actionCards.type.medicalTreatment'
}

/**
 * Human-readable label for an action card type. Falls back to the raw key
 * when no translation exists.
 * @param {string} action
 * @returns {string}
 */
export function actionCardLabel (action) {
  const key = LABEL_KEYS[action]
  return key ? t(key) : action
}
