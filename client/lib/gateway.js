import { toast } from '../partials/toast.js'
import { getLocale } from '../i18n/index.js'
import { getClientId } from './clientId.js'

/**
 * @param {Error} e
 * @returns {void}
 */
export function showServerError (e) {
  console.error('Server Error: ', e)
  toast(e.message ?? 'Something went wrong!', 'error')
}

/**
 * Awesome Proxy wrapper to call server with HTTP Post Request
 */
export const server = new Proxy({}, {
  get (_, key) {
    return async (...params) => {
      const requestBody = { params }
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': getLocale()
        },
        body: JSON.stringify(requestBody)
      }
      // Guarded like getClientId(): localStorage access throws outright when
      // storage is blocked (private mode), which would fail every request
      // instead of just leaving the request unauthenticated.
      let authToken = null
      try {
        authToken = window.localStorage.getItem('auth-token')
      } catch {
        authToken = null
      }
      if (authToken) {
        options.headers.Authorization = `Bearer ${authToken}`
      }
      // Anonymous visitor id, so routes that run before login (createAccount,
      // login) can attribute their funnel events to the same visitor that
      // viewed the landing page.
      const clientId = getClientId()
      if (clientId) {
        options.headers['X-Client-Id'] = clientId
      }
      const response = await fetch(`${window.__NATIVE_SERVER_URL || ''}/api/${key}`, options)
      if (response.status >= 400) {
        if (response.status === 401) {
          window.localStorage.removeItem('auth-token')
          toast('Please reload the page.', 'error')

          setTimeout(() => window.location.reload(), 1000)
        }
        throw (await response.json())
      }
      const { response: data } = await response.json()
      return data
    }
  }
})
