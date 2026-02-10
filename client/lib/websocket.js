/**
 * WebSocket client for real-time server events
 */

/** @type {WebSocket|null} */
let ws = null

/** @type {Map<string, Set<Function>>} */
const eventHandlers = new Map()

/** @type {number|null} */
let reconnectTimeout = null

/**
 * Connect to WebSocket server using the auth token
 */
export function connectWebSocket () {
  const token = window.localStorage.getItem('auth-token')
  if (!token) {
    console.log('No auth token, skipping WebSocket connection')
    return
  }

  // Don't reconnect if already connected
  if (ws && ws.readyState === WebSocket.OPEN) {
    return
  }

  // Clear any pending reconnect
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}?token=${token}`

  try {
    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('WebSocket connected')
    }

    ws.onmessage = (event) => {
      try {
        const { event: eventName, data } = JSON.parse(event.data)
        console.log('WebSocket event:', eventName, data)
        dispatchEvent(eventName, data)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason)
      ws = null

      // Reconnect after 5 seconds if we have a token (unless explicitly closed)
      if (event.code !== 4001 && event.code !== 4002 && event.code !== 4003) {
        const token = window.localStorage.getItem('auth-token')
        if (token) {
          reconnectTimeout = setTimeout(connectWebSocket, 5000)
        }
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  } catch (e) {
    console.error('Failed to create WebSocket:', e)
  }
}

/**
 * Disconnect WebSocket and clear reconnect timer
 */
export function disconnectWebSocket () {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }

  if (ws) {
    ws.close()
    ws = null
  }
}

/**
 * Register a handler for a server event
 * @param {string} eventName
 * @param {Function} handler
 * @returns {Function} - Unsubscribe function
 */
export function onServerEvent (eventName, handler) {
  if (!eventHandlers.has(eventName)) {
    eventHandlers.set(eventName, new Set())
  }
  eventHandlers.get(eventName).add(handler)

  // Return unsubscribe function
  return () => {
    const handlers = eventHandlers.get(eventName)
    if (handlers) {
      handlers.delete(handler)
    }
  }
}

/**
 * Unregister a handler for a server event
 * @param {string} eventName
 * @param {Function} handler
 */
export function offServerEvent (eventName, handler) {
  const handlers = eventHandlers.get(eventName)
  if (handlers) {
    handlers.delete(handler)
  }
}

/**
 * Dispatch an event to all registered handlers
 * @param {string} eventName
 * @param {any} data
 */
function dispatchEvent (eventName, data) {
  const handlers = eventHandlers.get(eventName)
  if (handlers) {
    handlers.forEach(handler => {
      try {
        handler(data)
      } catch (e) {
        console.error(`Error in event handler for ${eventName}:`, e)
      }
    })
  }
}

/**
 * Check if WebSocket is connected
 * @returns {boolean}
 */
export function isConnected () {
  return ws !== null && ws.readyState === WebSocket.OPEN
}
