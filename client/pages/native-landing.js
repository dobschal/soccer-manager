import { server } from '../lib/gateway.js'
import { value } from '../lib/html.js'
import { clearHasTeamCache, goTo, setQueryParams } from '../lib/router.js'
import { toast } from '../partials/toast.js'
import { UIElement } from '../lib/UIElement.js'
import { t } from '../i18n/index.js'
import { connectWebSocket } from '../lib/websocket.js'
import { sendLog } from '../lib/clientLogger.js'
import { isValidEmail } from '../lib/emailRegex.js'
import { getDeviceUuid } from '../lib/deviceUuid.js'
import { trackFunnelEvent } from '../lib/tracking.js'

async function _registerDeviceToken () {
  const token = window.__nativeDeviceToken
  const platform = window.__nativePlatform
  sendLog(`[Push] _registerDeviceToken called - token: ${token ? token.substring(0, 10) + '...' : 'MISSING'}, platform: ${platform || 'MISSING'}`)
  if (!token || !platform) {
    sendLog('[Push] _registerDeviceToken aborted: no token or platform', 'warn')
    return
  }
  try {
    await server.registerDeviceToken(token, platform)
    sendLog('[Push] _registerDeviceToken succeeded')
  } catch (e) {
    sendLog(`[Push] _registerDeviceToken FAILED: ${e?.message || JSON.stringify(e)}`, 'error')
  }
}

export class NativeLandingPage extends UIElement {
  async load () {
  }
  get template () {
    return `
      <div class="native-landing-page">
        <div class="native-landing-card">
          <img src="assets/logo.svg" alt="FootballManager.IO" class="native-landing-logo">
          <h1 class="native-landing-title">${t('landing.title')}</h1>
          ${this.isForgotPassword ? this._forgotPasswordTemplate() : this._loginTemplate()}
        </div>
      </div>
    `
  }
  get events () {
    return {
      form: {
        submit: this._onSubmit
      },
      'button[data-toggle]': {
        click: () => setQueryParams({ type: this.isLogin ? 'registration' : 'login' })
      },
      'button[data-forgot-password]': {
        click: () => setQueryParams({ type: 'forgot-password' })
      },
      'button[data-back-to-login]': {
        click: () => setQueryParams({ type: 'login' })
      }
    }
  }
  async onQueryChanged ({ type }) {
    this.isForgotPassword = type === 'forgot-password'
    this.isLogin = type === 'login'
    await this.update()
  }
  _loginTemplate () {
    return `
      <h2>${this.isLogin ? t('landing.welcomeBack') : t('landing.createAccount')}</h2>
      <form name="${this.isLogin ? 'login' : 'register'}" autocomplete="on">
        <div class="form-group mb-3">
          <label for="username-input">${t('landing.username')}</label>
          <input autofocus class="form-control" id="username-input" name="username" type="text" placeholder="${t('landing.enterUsername')}" autocomplete="username">
        </div>
        <div class="form-group mb-3 ${this.isLogin ? 'hidden' : ''}" id="email-area">
          <label for="email-input">${t('landing.email')}</label>
          <input class="form-control" id="email-input" name="email" type="email" placeholder="${t('landing.enterEmail')}" autocomplete="email">
        </div>
        <div class="form-group mb-3">
          <label for="password-input">${t('landing.password')}</label>
          <input class="form-control" id="password-input" name="password" type="password" placeholder="${t('landing.enterPassword')}" autocomplete="${this.isLogin ? 'current-password' : 'new-password'}">
        </div>
        ${this.isLogin
    ? ''
    : `<p class="small text-muted mb-2">${t('landing.privacyConsent')}</p>`}
        <button class="btn btn-info w-100 mb-2" type="submit">
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
  
  _forgotPasswordTemplate () {
    return `
      <h2>${t('landing.forgotPasswordTitle')}</h2>
      <form name="forgot-password" autocomplete="on">
        <p class="text-muted mb-3">${t('landing.forgotPasswordHint')}</p>
        <div class="form-group mb-3">
          <label for="forgot-email-input">${t('landing.email')}</label>
          <input autofocus class="form-control" id="forgot-email-input" name="email" type="email" placeholder="${t('landing.enterEmail')}" autocomplete="email">
        </div>
        <button class="btn btn-primary w-100 mb-2" type="submit">
          ${t('landing.forgotPasswordSubmit')}
        </button>
        <button data-back-to-login class="btn btn-link text-white w-100 p-0" type="button">
          ${t('landing.backToLogin')}
        </button>
      </form>
    `
  }

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
      const platform = window.__nativePlatform || 'web'
      if (!this.isLogin) {
        if (!isValidEmail(email)) {
          // Rejected before `createAccount` is even called, so the server would
          // never see this attempt — report it from here or it goes missing
          // from the funnel entirely.
          trackFunnelEvent('register-abort', 'email-invalid')
          this.isSubmitting = false
          return toast(t('landing.emailInvalid'), 'error')
        }
        await server.createAccount(username, password, email.trim())
        toast(t('landing.registrationSuccess'), 'success')
        const { token } = await server.login(username, password, platform, getDeviceUuid())
        window.localStorage.setItem('auth-token', token)
        clearHasTeamCache()
        connectWebSocket()
        await _registerDeviceToken()
        goTo('')
      } else {
        const { token } = await server.login(username, password, platform, getDeviceUuid())
        window.localStorage.setItem('auth-token', token)
        clearHasTeamCache()
        connectWebSocket()
        await _registerDeviceToken()
        goTo('')
        toast(t('landing.loginSuccess'), 'success')
      }
    } catch (e) {
      toast(e.message ?? t('landing.somethingWentWrong'), 'error')
    }
    this.isSubmitting = false
  }
}
