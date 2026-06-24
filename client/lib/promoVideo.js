import { getLocale } from '../i18n/index.js'

/**
 * Promo / tutorial YouTube videos, keyed by platform + locale. Shared between
 * the dashboard video card and the landing page hero (#445) so both always
 * point at the same clips.
 */
export const PROMO_VIDEO_IDS = {
  'mobile-de': 'D7v1Y2-HUlk',
  'mobile-en': 'gcBC70_ElFQ',
  'desktop-de': 'ogCKtnHt04s',
  'desktop-en': 'kK_OHx9gypc'
}

/**
 * Pick the right promo video id for the current locale and platform.
 * @param {{ isNativeApp?: boolean }} [opts]
 * @returns {string}
 */
export function getPromoVideoId ({ isNativeApp = Boolean(window.__nativePlatform) } = {}) {
  const platformKey = isNativeApp ? 'mobile' : 'desktop'
  const localeKey = getLocale() === 'de' ? 'de' : 'en'
  return PROMO_VIDEO_IDS[`${platformKey}-${localeKey}`]
}

/**
 * Render a responsive 16:9 YouTube embed for the given video id.
 * @param {string} videoId
 * @param {string} [title]
 * @returns {string}
 */
export function renderPromoVideoEmbed (videoId, title = 'FootballManager.IO') {
  return `<div class="ratio ratio-16x9">
      <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1" title="${title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen webkit-playsinline></iframe>
    </div>`
}
