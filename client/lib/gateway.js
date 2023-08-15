import { toast } from '../partials/toast.js'

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
      let requestBody
      if (key.endsWith('_V2')) {
        requestBody = { params }
      } else {
        requestBody = params[0] // the legacy implementation only allows one parameter
      }
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
      const authToken = window.localStorage.getItem('auth-token')
      if (authToken) {
        options.headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch(`/api/${key}`, options)
      if (response.status >= 400) {
        if (response.status === 401) {
          window.localStorage.removeItem('auth-token')
          toast('Please reload the page.', 'error')
        }
        throw (await response.json())
      }
      if (key.endsWith('_V2')) {
        const { response: r } = await response.json()
        return r
      }
      return await response.json()
    }
  }
})
