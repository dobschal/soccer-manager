import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getAdmins: vi.fn().mockResolvedValue({ admins: [] }),
    getStatistics: vi.fn().mockResolvedValue({ rows: [], total: 0, pageSize: 20 })
  }
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../partials/activeUsersChart.js', () => ({
  ActiveUsersChart: class { toString () { return '' } }
}))

vi.mock('../../i18n/index.js', () => ({
  t: (key, vars) => vars ? `${key}:${JSON.stringify(vars)}` : key,
  getLocale: () => 'en'
}))

vi.mock('../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('id'),
  el: vi.fn()
}))

const { AdminPage } = await import('../../pages/admin.js')
const { toast } = await import('../../partials/toast.js')

async function makeAdminPage () {
  const page = new AdminPage()
  await page.load()
  return page
}

describe('AdminPage iOS environment switcher', () => {
  beforeEach(() => {
    delete window.__nativePlatform
    delete window.__nativeEnvironment
    delete window.webkit
    window.confirm = vi.fn(() => true)
  })

  afterEach(() => {
    delete window.__nativePlatform
    delete window.__nativeEnvironment
    delete window.webkit
  })

  it('does not render the env switcher when not in iOS native app', async () => {
    const page = await makeAdminPage()
    const html = page.template
    expect(html).not.toContain('admin.iosEnvironmentTitle')
  })

  it('renders the env switcher with production selected by default on iOS native', async () => {
    window.__nativePlatform = 'ios'
    const page = await makeAdminPage()
    const html = page.template
    expect(html).toContain('admin.iosEnvironmentTitle')
    expect(html).toMatch(/<option value="production" selected>/)
    expect(html).not.toMatch(/<option value="sandbox" selected>/)
  })

  it('marks sandbox as selected when __nativeEnvironment is sandbox', async () => {
    window.__nativePlatform = 'ios'
    window.__nativeEnvironment = 'sandbox'
    const page = await makeAdminPage()
    const html = page.template
    expect(html).toMatch(/<option value="sandbox" selected>/)
    expect(html).not.toMatch(/<option value="production" selected>/)
  })

  it('toasts a missing-bridge error when the bridge is not available', async () => {
    window.__nativePlatform = 'ios'
    const page = await makeAdminPage()

    document.body.innerHTML = `
      <select id="${page._iosEnvSelectId}">
        <option value="production"></option>
        <option value="sandbox" selected></option>
      </select>
    `

    page._switchIosEnvironment()
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('admin.iosEnvironmentBridgeMissing'), 'error')
  })

  it('posts setEnvironment payload to the iOS bridge when switching to sandbox', async () => {
    window.__nativePlatform = 'ios'
    const postMessage = vi.fn()
    window.webkit = { messageHandlers: { fmioBridge: { postMessage } } }
    const page = await makeAdminPage()

    document.body.innerHTML = `
      <select id="${page._iosEnvSelectId}">
        <option value="production"></option>
        <option value="sandbox" selected></option>
      </select>
    `

    page._switchIosEnvironment()
    expect(postMessage).toHaveBeenCalledWith({ type: 'setEnvironment', env: 'sandbox' })
  })

  it('no-ops when the selected env matches the current env', async () => {
    window.__nativePlatform = 'ios'
    window.__nativeEnvironment = 'sandbox'
    const postMessage = vi.fn()
    window.webkit = { messageHandlers: { fmioBridge: { postMessage } } }
    const page = await makeAdminPage()

    document.body.innerHTML = `
      <select id="${page._iosEnvSelectId}">
        <option value="production"></option>
        <option value="sandbox" selected></option>
      </select>
    `

    page._switchIosEnvironment()
    expect(postMessage).not.toHaveBeenCalled()
  })
})
