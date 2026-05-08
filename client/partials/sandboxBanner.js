import { el } from '../lib/html.js'
import { isSandboxHost, PRODUCTION_URL } from '../lib/environment.js'
import { t } from '../i18n/index.js'

/**
 * Show a persistent banner informing the user that they are on the sandbox
 * (test) environment, with a link back to production.
 * Idempotent: safe to call more than once.
 * @returns {void}
 */
export function showSandboxBanner () {
  if (!isSandboxHost()) return
  if (el('#sandbox-banner')) return

  document.body.insertAdjacentHTML('afterbegin', `
    <div id="sandbox-banner" class="sandbox-banner" role="alert">
      <i class="fa fa-flask" aria-hidden="true"></i>
      <span>${t('sandbox.notice')}</span>
      <a href="${PRODUCTION_URL}" class="sandbox-banner-link">${t('sandbox.goToProd')}</a>
    </div>
  `)
}

/**
 * Apply noindex/nofollow robots meta tag when running on the sandbox so search
 * engines do not index the test environment.
 * @returns {void}
 */
export function applyNoIndexOnSandbox () {
  if (!isSandboxHost()) return
  const robots = document.querySelector('meta[name="robots"]')
  if (robots) robots.setAttribute('content', 'noindex, nofollow')
  const googlebot = document.querySelector('meta[name="googlebot"]')
  if (googlebot) googlebot.setAttribute('content', 'noindex, nofollow')
  const canonical = document.querySelector('link[rel="canonical"]')
  if (canonical) canonical.remove()
}
