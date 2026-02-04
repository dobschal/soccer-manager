import { server } from '../lib/gateway.js'
import { value } from '../lib/html.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { toast } from '../partials/toast.js'
import { UIElement } from '../lib/UIElement.js'

export class LandingPage extends UIElement {
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
                <span class="hero-badge">Free to Play</span>
                <h1 class="hero-title text-white">Soccer Manager IO</h1>
                <p class="hero-subtitle text-white">
                  Build your dream team from scratch, rise through the leagues, and become the ultimate football manager.
                  No downloads, no payments - just pure football strategy in your browser.
                </p>
                <img style="width: 100%; max-width: 520px" src="assets/landing-page/preview.png" alt="Game Preview" class="hero-preview-image mt-4">
              </div>
              <!-- Right side: Login form -->
              <div class="col-lg-4">
                <div class="login-card">
                  <h2 class="text-white">${this.isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                  <form>
                    <div class="form-group mb-3">
                      <label for="username-input">Username</label>
                      <input autofocus class="form-control" id="username-input" type="text" placeholder="Enter username">
                    </div>
                    <div class="form-group mb-3">
                      <label for="password-input">Password</label>
                      <input class="form-control" id="password-input" type="password" placeholder="Enter password">
                    </div>
                    <div class="form-group mb-3 ${this.isLogin ? 'hidden' : ''}" id="password-repeat-area">
                      <label for="password-repeat-input">Repeat Password</label>
                      <input class="form-control" id="password-repeat-input" type="password" placeholder="Repeat password">
                    </div>
                    <button class="btn btn-success w-100 mb-2" type="submit">
                      ${this.isLogin ? 'Login' : 'Create Account'}
                    </button>
                    <button data-toggle class="btn btn-link text-white w-100 p-0" type="button">
                      ${this.isLogin ? 'New here? Create an account' : 'Already have an account? Login'}
                    </button>
                  </form>
                </div>
                <ul class="feature-list text-white d-none d-lg-block">
                  <li>Manage your own fantasy football club</li>
                  <li>Compete against other players online</li>
                  <li>Build and upgrade your stadium</li>
                  <li>Climb up to League 1</li>
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
                <h2 class="text-white">Your Club, Your Rules</h2>
                <p class="text-white">
                  Take control of your very own fantasy football club. Start in the lowest league with a squad of unknown
                  talents and work your way up to the top division. Every decision matters - from player transfers
                  to tactical formations.
                </p>
                <p class="text-white">
                  Track your progress on the dashboard, collect action cards after each match, and stay updated
                  with the latest news from your league.
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
                <h2 class="text-white">Master Your Tactics</h2>
                <p class="text-white">
                  Football is a game of strategy. Choose from various formations - whether you prefer the classic
                  4-4-2, the attacking 3-4-3, or a defensive 5-3-2. Position your players wisely and watch them
                  execute your game plan.
                </p>
                <p class="text-white">
                  Each player has unique attributes and fitness levels. Rotate your squad, develop young talents,
                  and build a team that reflects your playing style.
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
                <h2 class="text-white">Build Your Stadium</h2>
                <p class="text-white">
                  Your stadium is the heart of your club. Expand the stands to welcome more fans, set ticket
                  prices strategically, and add roofs to boost attendance. More fans mean more revenue to
                  invest in your squad.
                </p>
                <p class="text-white">
                  Watch your home ground grow from a small venue into a legendary arena as you climb the leagues.
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
                <h2 class="text-white">Collect Action Cards</h2>
                <p class="text-white">
                  After each match day, you earn action cards with special abilities. Level up your players,
                  boost their fitness, recruit youth talents, or receive cash bonuses. Some cards can even be
                  merged into more powerful versions!
                </p>
                <p class="text-white">
                  Use your cards strategically to gain an edge over your rivals and accelerate your rise to the top.
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
            <h2 class="text-white">Ready to Start Your Journey?</h2>
            <p class="text-white">Join thousands of managers competing for glory. Free to play, no downloads required.</p>
            <button id="play-now-btn" class="btn btn-light btn-lg" type="button">Play Now</button>
          </div>
        </section>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
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
          return toast('Passwords are not equal...', 'error')
        }
        await server.createAccount(username, password)
        setQueryParams({ type: this.isLogin ? 'registration' : 'login' })
        toast('Registration successful!', 'success')
      } else {
        const { token } = await server.login(username, password)
        window.localStorage.setItem('auth-token', token)
        goTo('')
        toast('Login successful!', 'success')
      }
    } catch (e) {
      toast(e.message ?? 'Something went wrong...', 'error')
    }
    this.isSubmitting = false
  }
}
