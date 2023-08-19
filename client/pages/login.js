import { server } from '../lib/gateway.js'
import { value } from '../lib/html.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { toast } from '../partials/toast.js'
import { UIElement } from '../lib/UIElement.js'

export class LoginPage extends UIElement {
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
      <div>
        <h1>⚽ Socker Manager IO</h1>
        <h2>Login</h2>
        <form class="mb-5">
          <div class="form-group mb-2">
            <label for="username-input">Username</label>
            <input autofocus class="form-control" id="username-input" type="text" placeholder="Username">
          </div>
          <div class="form-group mb-2">
            <label for="password-input">Password</label>
            <input class="form-control" id="password-input" type="password" placeholder="Password">
          </div>
          <div class="form-group mb-2 ${this.isLogin ? 'hidden' : ''}" id="password-repeat-area">
            <label for="password-repeat-input">Repeat Password</label>
            <input class="form-control" id="password-repeat-input" type="password" placeholder="Repeat Password">
            <small class="form-text text-white" style="opacity: 0.66">Please enter the same password again to verify.</small>
          </div>
          <button class="btn btn-success mt-2" type="submit">${this.isLogin ? 'Login' : 'Create Account'}</button>
          <button data-toggle
                  class="btn btn-link text-white" 
                  type="button">
              ${this.isLogin ? '👉 Create New Account' : '👉 Show Login'}
          </button>
        </form>
        <small style="opacity: 0.66">
          This web page is not using Cookies or any external loaded or linked content or tools. 
          All scripts, content and data is hosted and served by the same own SoccerManagerIO server. 
          No data is given to third parties. <br>
          We are storing your username and password in our database in order to make the game working for you.
        </small>
      </div>
    `
  }

  async load () {}

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
          return toast('Passwords are not equal...', 'error')
        }
        await server.createAccount({ username, password })
        setQueryParams({ type: this.isLogin ? 'registration' : 'login' })
        toast('Registration successful!', 'success')
      } else {
        const { token } = await server.login({ username, password })
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
