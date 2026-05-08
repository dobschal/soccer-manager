/**
 * Detect whether the app is running on the sandbox/test environment.
 * @param {string} [hostname]
 * @returns {boolean}
 */
export function isSandboxHost (hostname = window.location.hostname) {
  return /^sandbox\./i.test(hostname)
}

/**
 * URL of the production environment, used to link sandbox visitors back to prod.
 */
export const PRODUCTION_URL = 'https://footballmanager.io'
