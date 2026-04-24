import { server } from '../lib/gateway.js'
import { value } from '../lib/html.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { toast } from '../partials/toast.js'
import { UIElement } from '../lib/UIElement.js'
import { t } from '../i18n/index.js'
import { connectWebSocket } from '../lib/websocket.js'
import { sendLog } from '../lib/clientLogger.js'

async function _registerDeviceToken () {
  const token = window.__nativeDeviceToken
  const platform = window.__nativePlatform || 'ios'
  sendLog(`[Push] _registerDeviceToken called - token: ${token ? token.substring(0, 10) + '...' : 'MISSING'}, platform: ${platform}`)
  if (!token) {
    sendLog('[Push] _registerDeviceToken aborted: no token', 'warn')
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
          <h2>${this.isLogin ? t('landing.welcomeBack') : t('landing.createAccount')}</h2>
          <form>
            <div class="form-group mb-3">
              <label for="username-input">${t('landing.username')}</label>
              <input autofocus class="form-control" id="username-input" type="text" placeholder="${t('landing.enterUsername')}">
            </div>
            <div class="form-group mb-3">
              <label for="password-input">${t('landing.password')}</label>
              <input class="form-control" id="password-input" type="password" placeholder="${t('landing.enterPassword')}">
            </div>
            <div class="form-group mb-3 ${this.isLogin ? 'hidden' : ''}" id="password-repeat-area">
              <label for="password-repeat-input">${t('landing.repeatPassword')}</label>
              <input class="form-control" id="password-repeat-input" type="password" placeholder="${t('landing.repeatPasswordPlaceholder')}">
            </div>
            <button class="btn btn-primary w-100 mb-2" type="submit">
              ${this.isLogin ? t('landing.loginBtn') : t('landing.createAccountBtn')}
            </button>
            <button data-toggle class="btn btn-link text-white w-100 p-0" type="button">
              ${this.isLogin ? t('landing.newHere') : t('landing.alreadyHaveAccount')}
            </button>
          </form>
        </div>
      </div>
    `
  }
  get events () {
    return {
      form: {
        submit: this._onSubmit
      },
      'button.btn-link': {
        click: () => setQueryParams({ type: this.isLogin ? 'registration' : 'login' })
      }
    }
  }
  async onQueryChanged ({ type }) {
    this.isLogin = type === 'login'
    await this.update()
  }

  async _onSubmit (event) {
    event.preventDefault()
    if (this.isSubmitting) return
    this.isSubmitting = true
    const username = value('#username-input')
    const password = value('#password-input')
    const repeatedPassword = value('#password-repeat-input')
    try {
      const platform = window.__nativePlatform || 'ios'
      if (!this.isLogin) {
        if (repeatedPassword !== password) {
          this.isSubmitting = false
          return toast(t('landing.passwordsNotEqual'), 'error')
        }
        await server.createAccount(username, password)
        toast(t('landing.registrationSuccess'), 'success')
        const { token } = await server.login(username, password, platform)
        window.localStorage.setItem('auth-token', token)
        connectWebSocket()
        await _registerDeviceToken()
        goTo('')
      } else {
        const { token } = await server.login(username, password, platform)
        window.localStorage.setItem('auth-token', token)
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
