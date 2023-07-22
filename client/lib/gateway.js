import { goTo } from './router.js'
import { toast } from '../partials/toast.js'

/**
 * Awesome Proxy wrapper to call server with HTTP Post Request
 */
export const server = new Proxy({}, {
  get (_, key) {
    return async (params) => {
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
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
      console.log('Response: ', response)
      return await response.json()
    }
  }
})
