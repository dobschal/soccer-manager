import { server } from '../lib/gateway.js'
import { value } from '../lib/html.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { toast } from '../partials/toast.js'
import { UIElement } from '../lib/UIElement.js'
import { t } from '../i18n/index.js'
import { connectWebSocket } from '../lib/websocket.js'

export class NativeLandingPage extends UIElement {
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
            <button class="btn btn-success w-100 mb-2" type="submit">
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

  async load () {
  }

  async onQueryChanged ({ type }) {
    this.isLogin = type !== 'registration'
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
      if (!this.isLogin) {
        if (repeatedPassword !== password) {
          this.isSubmitting = false
          return toast(t('landing.passwordsNotEqual'), 'error')
        }
        await server.createAccount(username, password)
        toast(t('landing.registrationSuccess'), 'success')
        const { token } = await server.login(username, password)
        window.localStorage.setItem('auth-token', token)
        connectWebSocket()
        goTo('')
      } else {
        const { token } = await server.login(username, password)
        window.localStorage.setItem('auth-token', token)
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
