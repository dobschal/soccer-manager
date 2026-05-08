/**
 * Detect whether an HTTP request was made against the sandbox/test deployment.
 * Sandbox is reached via sandbox.footballmanager.io and must be hidden from
 * search engines so it does not compete with the production domain.
 * @param {string} hostname
 * @returns {boolean}
 */
export function isSandboxHost (hostname) {
  return /^sandbox\./i.test(hostname || '')
}
