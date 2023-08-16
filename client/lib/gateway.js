import { toast } from '../partials/toast.js'
import { deepCopy } from './util.js'

export function showServerError (e) {
  console.error('Server Error: ', e)
  toast(e.message ?? 'Something went wrong!', 'error')
}

const serverCache = new Map()
const cacheIgnore = ['getMyBalance']

/**
 * Awesome Proxy wrapper to call server with HTTP Post Request
 */
export const server = new Proxy({}, {
  get (_, key) {
    return async (...params) => {
      const cacheKey = JSON.stringify({ params, key })
      if (!cacheIgnore.includes(key) && serverCache.has(cacheKey)) {
        const cachedResponse = serverCache.get(cacheKey)
        if (cachedResponse.timestamp > Date.now() - 1000 * 60) {
          console.log('Use server cache for ' + key)
          return deepCopy(cachedResponse.data)
        }
      }
      if (!key.startsWith('get')) {
        serverCache.clear()
        console.log('Clear server cache on ' + key)
      }
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
        const { response: data } = await response.json()
        serverCache.set(cacheKey, {
          timestamp: Date.now(),
          data: deepCopy(data)
        })
        return data
      }
      const data = await response.json()
      serverCache.set(cacheKey, {
        timestamp: Date.now(),
        data: deepCopy(data)
      })
      return data
    }
  }
})
