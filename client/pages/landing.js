import { server } from '../lib/gateway.js'
import { value } from '../lib/html.js'
import { clearHasTeamCache, goTo, setQueryParams } from '../lib/router.js'
import { toast } from '../partials/toast.js'
import { UIElement } from '../lib/UIElement.js'
import { t } from '../i18n/index.js'
import { connectWebSocket } from '../lib/websocket.js'
import { isValidEmail } from '../lib/emailRegex.js'
import { getDeviceUuid } from '../lib/deviceUuid.js'

export const APP_STORE_URL = 'https://apps.apple.com/de/app/footballmanager-io/id6759547142'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=io.soccermanager.app'
const APP_BANNER_DISMISSED_KEY = 'mobile-app-banner-dismissed'

/**
 * @returns {'ios' | 'android' | null} The detected mobile platform, or null if not a mobile browser.
 */
export function detectMobilePlatform (userAgent = navigator.userAgent || '') {
  if (/android/i.test(userAgent)) return 'android'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios'
  return null
}

export class LandingPage extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="landing-page">
        ${this._mobileAppBannerTemplate()}
        <!-- Hero Section -->
        <section class="hero-section">
          <div class="container bg-transparent">
            <div class="row align-items-center">
              <!-- Left side: Content -->
              <div class="col-lg-8 hero-content">
                <span class="hero-badge">${t('landing.freeToPlay')}</span>
                <h1 class="hero-title text-white">
                    <img src="assets/logo.svg" alt="FootballManager.IO" height="40" class="d-inline-block mb-2">
                    <span class="ps-2">${t('landing.title')}</span>
                 </h1>
                <p class="hero-subtitle text-white">
                  ${t('landing.subtitle')}
                </p>
                <p class="app-badges-label text-white">${t('landing.alsoAvailableOn')}</p>
                <div class="app-badges">
                  <a href="${APP_STORE_URL}" target="_blank" rel="noopener" class="app-badge-link" aria-label="${t('landing.getOnAppStore')}">
                    <img src="assets/landing-page/app-store-badge.svg" alt="${t('landing.getOnAppStore')}" class="app-badge">
                  </a>
                  <a href="${PLAY_STORE_URL}" target="_blank" rel="noopener" class="app-badge-link" aria-label="${t('landing.getOnGooglePlay')}">
                    <img src="assets/landing-page/google-play-badge.svg" alt="${t('landing.getOnGooglePlay')}" class="app-badge">
                  </a>
                </div>
                <img src="assets/landing-page/preview.png" alt="Game Preview" class="hero-preview-image mt-4">
              </div>
              <!-- Right side: Login form -->
              <div class="col-lg-4">
                <div class="login-card">
                  ${this.isForgotPassword ? this._forgotPasswordTemplate() : this._loginTemplate()}
                </div>
                <ul class="feature-list text-white d-none d-lg-block">
                  <li>${t('landing.feature1')}</li>
                  <li>${t('landing.feature2')}</li>
                  <li>${t('landing.feature3')}</li>
                  <li>${t('landing.feature4')}</li>
                </ul>
              </div>
            </div>
          </div>
          <div class="scroll-indicator d-none d-lg-block">
            <i class="fa fa-chevron-down fa-2x text-white"></i>
          </div>
        </section>

        <!-- Feature: Dashboard -->
        <section class="feature-section">
          <div class="container bg-transparent">
            <div class="row align-items-center">
              <div class="col-lg-6">
                <span class="feature-icon">🏆</span>
                <h2 class="text-white">${t('landing.yourClub')}</h2>
                <p class="text-white">
                  ${t('landing.yourClubDesc')}
                </p>
                <p class="text-white">
                  ${t('landing.yourClubDesc2')}
                </p>
              </div>
              <div class="col-lg-6">
                <img src="assets/landing-page/dashboard.png" alt="Dashboard Overview" class="feature-image">
              </div>
            </div>
          </div>
        </section>

        <!-- Feature: Tactics -->
        <section class="feature-section">
          <div class="container bg-transparent">
            <div class="row align-items-center">
              <div class="col-lg-6 order-lg-2">
                <span class="feature-icon">⚽</span>
                <h2 class="text-white">${t('landing.masterTactics')}</h2>
                <p class="text-white">
                  ${t('landing.masterTacticsDesc')}
                </p>
                <p class="text-white">
                  ${t('landing.masterTacticsDesc2')}
                </p>
              </div>
              <div class="col-lg-6 order-lg-1">
                <img src="assets/landing-page/team.png" alt="Team Tactics" class="feature-image">
              </div>
            </div>
          </div>
        </section>

        <!-- Feature: Stadium -->
        <section class="feature-section">
          <div class="container bg-transparent">
            <div class="row align-items-center">
              <div class="col-lg-6">
                <span class="feature-icon">🏟️</span>
                <h2 class="text-white">${t('landing.buildStadium')}</h2>
                <p class="text-white">
                  ${t('landing.buildStadiumDesc')}
                </p>
                <p class="text-white">
                  ${t('landing.buildStadiumDesc2')}
                </p>
              </div>
              <div class="col-lg-6">
                <img src="assets/landing-page/stadion.png" alt="Stadium Management" class="feature-image">
              </div>
            </div>
          </div>
        </section>

        <!-- Feature: Action Cards -->
        <section class="feature-section">
          <div class="container bg-transparent">
            <div class="row align-items-center">
              <div class="col-lg-6 order-lg-2">
                <h2 class="text-white">${t('landing.actionCards')}</h2>
                <p class="text-white">
                  ${t('landing.actionCardsDesc')}
                </p>
                <p class="text-white">
                  ${t('landing.actionCardsDesc2')}
                </p>
              </div>
              <div class="col-lg-6 order-lg-1">
                <img src="assets/landing-page/action-cards.png" alt="Action Cards" class="feature-image">
              </div>
            </div>
          </div>
        </section>

        <!-- CTA Section -->
        <section class="cta-section">
          <div class="container bg-transparent">
            <h2 class="text-white">${t('landing.readyToStart')}</h2>
            <p class="text-white">${t('landing.joinThousands')}</p>
            <button id="play-now-btn" class="btn btn-light btn-lg" type="button">${t('landing.playNow')}</button>
          </div>
        </section>
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      form: {
        submit: this._onSubmit
      },
      'button[data-toggle]': {
        click: () => setQueryParams({ type: this.isLogin ? 'registration' : 'login' })
      },
      '(optional) button[data-forgot-password]': {
        click: () => setQueryParams({ type: 'forgot-password' })
      },
      '(optional) button[data-back-to-login]': {
        click: () => setQueryParams({ type: 'login' })
      },
      '#play-now-btn': {
        click: () => {
          setQueryParams({ type: 'registration' })
          document.querySelector('.login-card')?.scrollIntoView({ behavior: 'smooth' })
          setTimeout(() => document.getElementById('username-input')?.focus(), 500)
        }
      },
      '(optional) [data-close-app-banner]': {
        click: () => {
          window.localStorage.setItem(APP_BANNER_DISMISSED_KEY, '1')
          document.querySelector('.mobile-app-banner')?.remove()
        }
      }
    }
  }

  /**
   * @param {Object} params
   * @param {string} params.type
   * @param {string} [params.email] - URL-encoded email to prefill the registration form (used by referral email links)
   * @returns {Promise<void>}
   */
  async onQueryChanged ({ type, email }) {
    this.isForgotPassword = type === 'forgot-password'
    this.isLogin = type === 'login'
    let decoded = ''
    if (email) {
      try {
        decoded = decodeURIComponent(email)
      } catch {
        decoded = ''
      }
    }
    // Escape so a crafted URL can't inject attributes (e.g. `email=" onfocus=...`).
    this.prefillEmail = decoded
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    await this.update()
  }

  /**
   * @returns {string}
   */
  _mobileAppBannerTemplate () {
    if (typeof window === 'undefined') return ''
    if (window.localStorage?.getItem(APP_BANNER_DISMISSED_KEY) === '1') return ''
    const platform = detectMobilePlatform()
    // iOS Safari shows its own native smart app banner via the
    // `apple-itunes-app` meta tag in index.html — don't double up.
    if (platform !== 'android') return ''
    const storeUrl = PLAY_STORE_URL
    return `
      <div class="mobile-app-banner" data-platform="${platform}">
        <button type="button" class="mobile-app-banner__close" data-close-app-banner aria-label="Close">
          <i class="fa fa-times"></i>
        </button>
        <img src="assets/logo.svg" alt="" class="mobile-app-banner__icon">
        <div class="mobile-app-banner__text">
          <div class="mobile-app-banner__title">${t('landing.appBannerTitle')}</div>
          <div class="mobile-app-banner__subtitle">${t('landing.appBannerSubtitle')}</div>
        </div>
        <a href="${storeUrl}" target="_blank" rel="noopener" class="mobile-app-banner__cta">
          ${t('landing.appBannerCta')}
        </a>
      </div>
    `
  }

  /**
   * @returns {string}
   */
  _loginTemplate () {
    return `
      <h2 class="text-white">${this.isLogin ? t('landing.welcomeBack') : t('landing.createAccount')}</h2>
      <form name="${this.isLogin ? 'login' : 'register'}" autocomplete="on">
        <div class="form-group mb-3">
          <label for="username-input">${t('landing.username')}</label>
          <input autofocus class="form-control" id="username-input" name="username" type="text" placeholder="${t('landing.enterUsername')}" autocomplete="username">
        </div>
        <div class="form-group mb-3 ${this.isLogin ? 'hidden' : ''}" id="email-area">
          <label for="email-input">${t('landing.email')}</label>
          <input class="form-control" id="email-input" name="email" type="email" placeholder="${t('landing.enterEmail')}" autocomplete="email" value="${this.prefillEmail ?? ''}">
        </div>
        <div class="form-group mb-3">
          <label for="password-input">${t('landing.password')}</label>
          <input class="form-control" id="password-input" name="password" type="password" placeholder="${t('landing.enterPassword')}" autocomplete="${this.isLogin ? 'current-password' : 'new-password'}">
        </div>
        ${this.isLogin
    ? ''
    : `<p class="small text-white-50 mb-2">${t('landing.privacyConsent')}</p>`}
        <button class="btn btn-success w-100 mb-2" type="submit">
          ${this.isLogin ? t('landing.loginBtn') : t('landing.createAccountBtn')}
        </button>
        <button data-toggle class="btn btn-link text-white w-100 p-0" type="button">
          ${this.isLogin ? t('landing.newHere') : t('landing.alreadyHaveAccount')}
        </button>
        ${this.isLogin
    ? `<button data-forgot-password class="btn btn-link text-white w-100 p-0" type="button">${t('landing.forgotPassword')}</button>`
    : ''}
      </form>
    `
  }

  /**
   * @returns {string}
   */
  _forgotPasswordTemplate () {
    return `
      <h2 class="text-white">${t('landing.forgotPasswordTitle')}</h2>
      <form name="forgot-password" autocomplete="on">
        <p class="text-white-50 mb-3">${t('landing.forgotPasswordHint')}</p>
        <div class="form-group mb-3">
          <label for="forgot-email-input">${t('landing.email')}</label>
          <input autofocus class="form-control" id="forgot-email-input" name="email" type="email" placeholder="${t('landing.enterEmail')}" autocomplete="email">
        </div>
        <button class="btn btn-success w-100 mb-2" type="submit">
          ${t('landing.forgotPasswordSubmit')}
        </button>
        <button data-back-to-login class="btn btn-link text-white w-100 p-0" type="button">
          ${t('landing.backToLogin')}
        </button>
      </form>
    `
  }

  /**
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async _onSubmit (event) {
    event.preventDefault()
    if (this.isSubmitting) return
    this.isSubmitting = true
    if (this.isForgotPassword) {
      try {
        const forgotEmail = value('#forgot-email-input')
        if (!isValidEmail(forgotEmail)) {
          this.isSubmitting = false
          return toast(t('landing.emailInvalid'), 'error')
        }
        await server.requestPasswordReset(forgotEmail.trim())
        toast(t('landing.forgotPasswordSent'), 'success')
        setQueryParams({ type: 'login' })
      } catch (e) {
        toast(e.message ?? t('landing.somethingWentWrong'), 'error')
      }
      this.isSubmitting = false
      return
    }
    const username = value('#username-input')
    const password = value('#password-input')
    const email = value('#email-input')
    try {
      if (!this.isLogin) {
        if (!isValidEmail(email)) {
          this.isSubmitting = false
          return toast(t('landing.emailInvalid'), 'error')
        }
        await server.createAccount(username, password, email.trim())
        toast(t('landing.registrationSuccess'), 'success')
        // Auto-login after successful registration
        const { token } = await server.login(username, password, 'web', getDeviceUuid())
        window.localStorage.setItem('auth-token', token)
        clearHasTeamCache()
        connectWebSocket()
        goTo('')
      } else {
        const { token } = await server.login(username, password, 'web', getDeviceUuid())
        window.localStorage.setItem('auth-token', token)
        clearHasTeamCache()
        connectWebSocket()
        goTo('')
        toast(t('landing.loginSuccess'), 'success')
      }
    } catch (e) {
      toast(e.message ?? t('landing.somethingWentWrong'), 'error')
    }
    this.isSubmitting = false
  }
}
