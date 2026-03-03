/**
 * Shared state for iOS push notification token management.
 * Used to bridge between the AppDelegate (which receives the token)
 * and the WebView (which needs to send it to the server).
 */

export let deviceToken: string | null = null

type TokenCallback = (token: string, platform: string) => void
let _tokenCallback: TokenCallback | null = null

/**
 * Called by the AppDelegate when iOS provides a device token.
 * If the WebView injector is already registered, calls it immediately.
 */
export function onDeviceToken (token: string): void {
  deviceToken = token
  console.log('[Push] Device token received:', token.substring(0, 10) + '...')
  if (_tokenCallback) {
    _tokenCallback(token, 'ios')
  }
}

/**
 * Register a callback to be called when a device token is available.
 * If a token is already stored, the callback is called immediately.
 */
export function onTokenAvailable (callback: TokenCallback): void {
  _tokenCallback = callback
  if (deviceToken) {
    callback(deviceToken, 'ios')
  }
}
