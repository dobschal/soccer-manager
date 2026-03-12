import { server } from '../lib/gateway.js'
import { value } from '../lib/html.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { toast } from '../partials/toast.js'
import { UIElement } from '../lib/UIElement.js'
import { t } from '../i18n/index.js'
import { connectWebSocket } from '../lib/websocket.js'

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
                <img style="width: 100%; max-width: 520px" src="assets/landing-page/preview.png" alt="Game Preview" class="hero-preview-image mt-4">
              </div>
              <!-- Right side: Login form -->
              <div class="col-lg-4">
                <div class="login-card">
                  <h2 class="text-white">${this.isLogin ? t('landing.welcomeBack') : t('landing.createAccount')}</h2>
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
      'button.btn-link': {
        click: () => setQueryParams({ type: this.isLogin ? 'registration' : 'login' })
      },
      '#play-now-btn': {
        click: () => {
          setQueryParams({ type: 'registration' })
          document.querySelector('.login-card')?.scrollIntoView({ behavior: 'smooth' })
          setTimeout(() => document.getElementById('username-input')?.focus(), 500)
        }
      }
    }
  }
  /**
   * @param {Object} params
   * @param {string} params.type
   * @returns {Promise<void>}
   */
  async onQueryChanged ({ type }) {
    this.isLogin = type !== 'registration'
    await this.update()
  }

  /**
   * @param {Event} event
   * @returns {Promise<void>}
   */
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
        // Auto-login after successful registration
        const { token } = await server.login(username, password, 'web')
        window.localStorage.setItem('auth-token', token)
        connectWebSocket()
        goTo('')
      } else {
        const { token } = await server.login(username, password, 'web')
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
