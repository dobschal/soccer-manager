import { onClick, onSubmit } from '../lib/htmlEventHandlers.js'
import { server } from '../lib/gateway.js'
import { el, generateId, value } from '../lib/html.js'
import { goTo } from '../lib/router.js'
import { toast } from '../partials/toast.js'

export function renderLoginPage () {
  let showRegistration = false
  let isSubmitting = false
  const loginFormId = generateId()

  function toggleView () {
    showRegistration = !showRegistration
    if (showRegistration) {
      el('button[type=submit]').innerText = 'Create Account'
      el('#toggle-view-button').innerText = 'Show Login'
      el('#password-repeat-area').classList.remove('hidden')
    } else {
      el('button[type=submit]').innerText = 'Login'
      el('#toggle-view-button').innerText = 'Create New Account'
      el('#password-repeat-area').classList.add('hidden')
    }
  }

  onSubmit(loginFormId, async event => {
    event.preventDefault()
    if (isSubmitting) return
    isSubmitting = true
    const username = value('#username-input')
    const password = value('#password-input')
    const repeatedPassword = value('#password-repeat-input')
    try {
      if (showRegistration) {
        if (repeatedPassword !== password) {
          isSubmitting = false
          return toast('Passwords are not equal...', 'error')
        }
        await server.createAccount({ username, password })
        toggleView()
        toast('Registration successful!', 'success')
      } else {
        const { token } = await server.login({ username, password })
        window.localStorage.setItem('auth-token', token)
        goTo('')
      }
    } catch (e) {
      toast(e.message ?? 'Something went wrong...', 'error')
    }
    isSubmitting = false
  })

  onClick('#toggle-view-button', () => {
    toggleView()
  })

  return `
    <div>
      <h1>⚽ Socker Manager IO</h1>
      <h2>Login</h2>
      <form id="${loginFormId}" class="mb-5">
        <div class="form-group mb-2">
          <label for="username-input">Username</label>
          <input autofocus class="form-control" id="username-input" type="text" placeholder="Username">
        </div>
        <div class="form-group mb-2">
          <label for="password-input">Password</label>
          <input class="form-control" id="password-input" type="password" placeholder="Password">
        </div>
        <div class="form-group mb-2 hidden" id="password-repeat-area">
          <label for="password-repeat-input">Repeat Password</label>
          <input class="form-control" id="password-repeat-input" type="password" placeholder="Repeat Password">
          <small class="form-text text-white" style="opacity: 0.66">Please enter the same password again to verify.</small>
        </div>
        <button class="btn btn-success mt-2" type="submit">👉 Login</button>
        <button class="btn btn-link text-white" type="button" id="toggle-view-button">👉 Create New Account</button>
      </form>
      <small style="opacity: 0.66">
        This web page is not using Cookies or any external loaded or linked content or tools. All scripts, content and data is hosted and served by the same own SoccerManagerIO server. No data is given to third parties. <br>We are storing your username and password in our database in order to make the game working for you.
      </small>
    </div>
  `
}
