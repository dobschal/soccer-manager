/**
 *  We use JWT authentication, and store the token in the localStorage
 *
 * @returns {boolean}
 */
export function isAuthenticated () {
  return Boolean(window.localStorage.getItem('auth-token'))
}
