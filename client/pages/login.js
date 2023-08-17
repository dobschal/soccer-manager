import { onClick, onSubmit } from '../lib/htmlEventHandlers.js'
import { server } from '../lib/gateway.js'
import { generateId, value } from '../lib/html.js'
import { getQueryParams, goTo, setQueryParams } from '../lib/router.js'
import { toast } from '../partials/toast.js'

let isSubmitting, loginFormId, isLogin

export function renderLoginPage () {
  const { type } = getQueryParams()
  isSubmitting = false
  loginFormId = generateId()
  isLogin = type !== 'registration'

  onSubmit(loginFormId, _onSubmit)

  onClick('#toggle-view-button', () => {
    setQueryParams({ type: isLogin ? 'registration' : 'login' })
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
        <div class="form-group mb-2 ${isLogin ? 'hidden' : ''}" id="password-repeat-area">
          <label for="password-repeat-input">Repeat Password</label>
          <input class="form-control" id="password-repeat-input" type="password" placeholder="Repeat Password">
          <small class="form-text text-white" style="opacity: 0.66">Please enter the same password again to verify.</small>
        </div>
        <button class="btn btn-success mt-2" type="submit">${isLogin ? 'Login' : 'Create Account'}</button>
        <button class="btn btn-link text-white" type="button" id="toggle-view-button">
            ${isLogin ? '👉 Create New Account' : '👉 Show Login'}
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

async function _onSubmit (event) {
  event.preventDefault()
  if (isSubmitting) return
  isSubmitting = true
  const username = value('#username-input')
  const password = value('#password-input')
  const repeatedPassword = value('#password-repeat-input')
  try {
    if (!isLogin) {
      if (repeatedPassword !== password) {
        isSubmitting = false
        return toast('Passwords are not equal...', 'error')
      }
      await server.createAccount({ username, password })
      setQueryParams({ type: isLogin ? 'registration' : 'login' })
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
  isSubmitting = false
}
