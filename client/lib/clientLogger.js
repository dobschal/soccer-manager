import { server } from './gateway.js'

/**
 * Send a log message to the server. Fire-and-forget — never throws.
 * @param {string} message
 * @param {'debug'|'info'|'warn'|'error'} level
 */
export function sendLog (message, level = 'info') {
  try {
    const url = window.location.href
    const platform = window.__nativePlatform || 'web'
    server.log(message, level, url, platform).catch(() => {})
  } catch {
    // silently swallow — logging must never break the app
  }
}

/**
 * Install global error handlers that automatically send errors to the server.
 */
export function installGlobalErrorHandler () {
  window.onerror = (message, source, lineno, colno, error) => {
    const parts = [`${message}`]
    if (source) parts.push(`at ${source}:${lineno}:${colno}`)
    if (error?.stack) parts.push(error.stack)
    sendLog(parts.join('\n'), 'error')
  }

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason?.stack || reason?.message || String(reason)
    sendLog(`Unhandled rejection: ${message}`, 'error')
  })
}
