import { t } from '../i18n/index.js'

const SVG_PATHS = {
  LEVEL_UP_PLAYER_100: 'assets/action-cards/level-up-player-10.svg',
  LEVEL_UP_PLAYER_70: 'assets/action-cards/level-up-player-7.svg',
  LEVEL_UP_PLAYER_40: 'assets/action-cards/level-up-player-4.svg',
  CHANGE_PLAYER_POSITION: 'assets/action-cards/change-player-position.svg',
  NEW_YOUTH_PLAYER: 'assets/action-cards/new-youth-player.svg',
  FRESHNESS_5: 'assets/action-cards/freshness-5.svg',
  FRESHNESS_10: 'assets/action-cards/freshness-10.svg',
  FRESHNESS_20: 'assets/action-cards/freshness-20.svg',
  BONUS_100K: 'assets/action-cards/bonus-100k.svg',
  STAR_PLAYER: 'assets/action-cards/star-player.svg',
  MOTIVATING_SPEECH: 'assets/action-cards/motivating-speech.svg'
}

const SVG_I18N_KEYS = {
  LEVEL_UP_PLAYER_100: 'levelUp10',
  LEVEL_UP_PLAYER_70: 'levelUp7',
  LEVEL_UP_PLAYER_40: 'levelUp4',
  CHANGE_PLAYER_POSITION: 'changePosition',
  NEW_YOUTH_PLAYER: 'newYouthPlayer',
  FRESHNESS_5: 'freshness5',
  FRESHNESS_10: 'freshness10',
  FRESHNESS_20: 'freshness20',
  BONUS_100K: 'bonus100k',
  STAR_PLAYER: 'starPlayer',
  MOTIVATING_SPEECH: 'motivatingSpeech'
}

const svgCache = new Map()
const pendingFetches = new Map()

/**
 * @param {string} actionType
 * @returns {Promise<string>}
 */
export async function loadActionCardSvg (actionType) {
  if (svgCache.has(actionType)) return svgCache.get(actionType)
  if (pendingFetches.has(actionType)) return pendingFetches.get(actionType)

  const path = SVG_PATHS[actionType] || SVG_PATHS.LEVEL_UP_PLAYER_40
  const promise = fetch(path)
    .then(response => response.text())
    .then(text => {
      svgCache.set(actionType, text)
      pendingFetches.delete(actionType)
      return text
    })
  pendingFetches.set(actionType, promise)
  return promise
}

/**
 * @param {string[]} actionTypes
 * @returns {Promise<void>}
 */
export async function preloadActionCardSvgs (actionTypes) {
  const unique = [...new Set(actionTypes)]
  await Promise.all(unique.map(loadActionCardSvg))
}

/**
 * @returns {Promise<void>}
 */
export async function preloadAllActionCardSvgs () {
  await preloadActionCardSvgs(Object.keys(SVG_PATHS))
}

const EMPTY_SVG = '<svg class="action-card-image" viewBox="0 0 250 350" xmlns="http://www.w3.org/2000/svg"></svg>'

let instanceCounter = 0

/**
 * Returns inline SVG markup for an action card with placeholders replaced by
 * the current locale's translated text. The SVG is rendered inline (not via
 * <img>) so it can use the document's @font-face fonts (e.g. Neucha). All
 * internal IDs are suffixed per call to avoid collisions when multiple
 * instances of the same card are rendered together.
 * @param {string} actionType
 * @returns {string}
 */
export function renderActionCardSvg (actionType) {
  const raw = svgCache.get(actionType)
  if (!raw) return EMPTY_SVG

  let out = raw
  const i18nKey = SVG_I18N_KEYS[actionType]
  if (i18nKey) {
    const replacements = {
      HEADER: t('actionCards.svg.header'),
      TITLE: t(`actionCards.svg.${i18nKey}.title`),
      BODY1: t(`actionCards.svg.${i18nKey}.body1`),
      BODY2: t(`actionCards.svg.${i18nKey}.body2`),
      FOOTER: t(`actionCards.svg.${i18nKey}.footer`)
    }
    for (const [key, value] of Object.entries(replacements)) {
      out = out.replaceAll(`{{${key}}}`, escapeXml(value))
    }
  }
  out = makeIdsUnique(out, ++instanceCounter)
  return out.replace('<svg ', '<svg class="action-card-image" ')
}

/**
 * Suffixes all id="..." attributes and url(#...) / href="#..." references in
 * the SVG with a unique token so identical SVGs rendered on the same page
 * don't share IDs.
 * @param {string} svg
 * @param {number} suffix
 * @returns {string}
 */
function makeIdsUnique (svg, suffix) {
  const tag = `ac${suffix}`
  return svg
    .replace(/id="([^"]+)"/g, (_, id) => `id="${id}-${tag}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${id}-${tag})`)
    .replace(/xlink:href="#([^"]+)"/g, (_, id) => `xlink:href="#${id}-${tag}"`)
    .replace(/(\s)href="#([^"]+)"/g, (_, sp, id) => `${sp}href="#${id}-${tag}"`)
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeXml (s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
