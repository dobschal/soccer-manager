/**
 * Shared state for push notification token management.
 * Used to bridge between the native push registration code (AppDelegate on iOS,
 * FirebaseMessaging on Android) and the WebView (which needs to send the token
 * to the server).
 */

export let deviceToken: string | null = null
export let devicePlatform: 'ios' | 'android' | null = null
export let registrationError: string | null = null

type TokenCallback = (token: string, platform: string) => void
let _tokenCallback: TokenCallback | null = null

/**
 * Called when the OS provides a device token.
 * If the WebView injector is already registered, calls it immediately.
 */
export function onDeviceToken (token: string, platform: 'ios' | 'android'): void {
  deviceToken = token
  devicePlatform = platform
  registrationError = null
  console.log(`[Push] Device token received (${platform}):`, token.substring(0, 10) + '...')
  if (_tokenCallback) {
    _tokenCallback(token, platform)
  }
}

/**
 * Called when the OS fails to register for remote notifications.
 */
export function onRegistrationError (error: string): void {
  registrationError = error
  console.error('[Push] Registration error stored:', error)
}

/**
 * Register a callback to be called when a device token is available.
 * If a token is already stored, the callback is called immediately.
 */
export function onTokenAvailable (callback: TokenCallback): void {
  _tokenCallback = callback
  if (deviceToken && devicePlatform) {
    callback(deviceToken, devicePlatform)
  }
}
