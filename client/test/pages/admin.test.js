import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getAdmins: vi.fn().mockResolvedValue({ admins: [] }),
    getStatistics: vi.fn().mockResolvedValue({ rows: [], total: 0, pageSize: 20 }),
    getTopCountries: vi.fn().mockResolvedValue({ rows: [] }),
    getSuspiciousActions: vi.fn().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 10 })
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

vi.mock('../../partials/dialog.js', () => ({
  showDialog: vi.fn().mockResolvedValue({ ok: true, value: undefined })
}))

vi.mock('../../lib/clientLogger.js', () => ({
  sendLog: vi.fn()
}))

vi.mock('../../lib/router.js', () => ({
  getQueryParams: () => ({})
}))

const { AdminPage } = await import('../../pages/admin.js')
const { GeneralAdminPage } = await import('../../pages/admin/general.js')
const { MarketingAdminPage } = await import('../../pages/admin/marketing.js')
const { UserManagementAdminPage } = await import('../../pages/admin/userManagement.js')
const { StatisticsAdminPage } = await import('../../pages/admin/statistics.js')
const { toast } = await import('../../partials/toast.js')
const { showDialog } = await import('../../partials/dialog.js')
const { server } = await import('../../lib/gateway.js')

describe('AdminPage sub-page navigation', () => {
  it('renders nav links for the four sub-pages', () => {
    const page = new AdminPage()
    const html = page.template
    expect(html).toContain('admin.tabMarketing')
    expect(html).toContain('admin.tabUserManagement')
    expect(html).toContain('admin.tabStatistics')
    expect(html).toContain('admin.tabGeneral')
    expect(html).toContain('href="#admin"')
    expect(html).toContain('href="#admin?sub_page=user_management"')
    expect(html).toContain('href="#admin?sub_page=statistics"')
    expect(html).toContain('href="#admin?sub_page=general"')
  })

  it('defaults to the marketing sub-page', () => {
    const page = new AdminPage()
    expect(page.defaultSubPageKey).toBe('marketing')
    expect(page.createSubPage('marketing')).toBeInstanceOf(MarketingAdminPage)
  })

  it('creates the requested sub-page instance', () => {
    const page = new AdminPage()
    expect(page.createSubPage('user_management')).toBeInstanceOf(UserManagementAdminPage)
    expect(page.createSubPage('statistics')).toBeInstanceOf(StatisticsAdminPage)
    expect(page.createSubPage('general')).toBeInstanceOf(GeneralAdminPage)
  })
})

describe('UserManagementAdminPage suspicious actions table', () => {
  beforeEach(() => {
    server.getAdmins.mockResolvedValue({ admins: [] })
    server.getSuspiciousActions.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 10 })
  })

  it('requests page 1 with size 10 on initial load', async () => {
    const page = new UserManagementAdminPage()
    await page.load()
    expect(server.getSuspiciousActions).toHaveBeenCalledWith(1, 10)
  })

  it('renders the empty state when no actions are returned', async () => {
    const page = new UserManagementAdminPage()
    await page.load()
    const html = page.template
    expect(html).toContain('admin.suspiciousActionsTitle')
    expect(html).toContain('admin.suspiciousActionsEmpty')
    expect(html).not.toContain('admin.suspiciousActionsTime')
  })

  it('renders rows with description, time and user/team names', async () => {
    server.getSuspiciousActions.mockResolvedValue({
      rows: [{
        type: 'shared_ip',
        time: '2026-06-03T10:00:00.000Z',
        description_key: 'admin.fraudDescSharedIp',
        description_params: { ip: '1.2.3.4' },
        user1: { username: 'alice', team_name: 'FC Alice' },
        user2: { username: 'bob', team_name: 'FC Bob' }
      }],
      total: 1,
      page: 1,
      pageSize: 10
    })
    const page = new UserManagementAdminPage()
    await page.load()
    const html = page.template
    expect(html).toContain('admin.fraudDescSharedIp')
    expect(html).toContain('"ip":"1.2.3.4"')
    expect(html).toContain('alice (FC Alice)')
    expect(html).toContain('bob (FC Bob)')
  })

  it('shows an em dash for missing users in a pair', async () => {
    server.getSuspiciousActions.mockResolvedValue({
      rows: [{
        type: 'overvalued_trade',
        time: '2026-06-03T10:00:00.000Z',
        description_key: 'admin.fraudDescOvervaluedTrade',
        description_params: { percent: 250, price: 100_000_000, value: 40_000_000 },
        user1: { username: 'seller', team_name: 'Seller FC' },
        user2: { username: null, team_name: 'Bot Team' }
      }],
      total: 1,
      page: 1,
      pageSize: 10
    })
    const page = new UserManagementAdminPage()
    await page.load()
    const html = page.template
    expect(html).toContain('seller (Seller FC)')
    expect(html).toContain('<td>—</td>')
  })

  it('renders pagination controls when results exist', async () => {
    server.getSuspiciousActions.mockResolvedValue({
      rows: [{
        type: 'shared_ip',
        time: '2026-06-03T10:00:00.000Z',
        description_key: 'admin.fraudDescSharedIp',
        description_params: { ip: '1.1.1.1' },
        user1: { username: 'a', team_name: 'A' },
        user2: { username: 'b', team_name: 'B' }
      }],
      total: 25,
      page: 1,
      pageSize: 10
    })
    const page = new UserManagementAdminPage()
    await page.load()
    const html = page.template
    expect(html).toContain('admin.paginationPrev')
    expect(html).toContain('admin.paginationNext')
    expect(html).toContain('"page":1')
    expect(html).toContain('"total":3') // ceil(25 / 10)
  })
})

describe('GeneralAdminPage iOS environment switcher', () => {
  beforeEach(() => {
    delete window.__nativePlatform
    delete window.__nativeEnvironment
    delete window.webkit
    showDialog.mockResolvedValue({ ok: true, value: undefined })
  })

  afterEach(() => {
    delete window.__nativePlatform
    delete window.__nativeEnvironment
    delete window.webkit
  })

  it('does not render the env switcher when not in iOS native app', () => {
    const page = new GeneralAdminPage()
    const html = page.template
    expect(html).not.toContain('admin.iosEnvironmentTitle')
  })

  it('renders the env switcher with production selected by default on iOS native', () => {
    window.__nativePlatform = 'ios'
    const page = new GeneralAdminPage()
    const html = page.template
    expect(html).toContain('admin.iosEnvironmentTitle')
    expect(html).toMatch(/<option value="production" selected>/)
    expect(html).not.toMatch(/<option value="sandbox" selected>/)
  })

  it('marks sandbox as selected when __nativeEnvironment is sandbox', () => {
    window.__nativePlatform = 'ios'
    window.__nativeEnvironment = 'sandbox'
    const page = new GeneralAdminPage()
    const html = page.template
    expect(html).toMatch(/<option value="sandbox" selected>/)
    expect(html).not.toMatch(/<option value="production" selected>/)
  })

  it('toasts a missing-bridge error when the bridge is not available', async () => {
    window.__nativePlatform = 'ios'
    const page = new GeneralAdminPage()

    document.body.innerHTML = `
      <select id="${page._iosEnvSelectId}">
        <option value="production"></option>
        <option value="sandbox" selected></option>
      </select>
    `

    await page._switchIosEnvironment()
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('admin.iosEnvironmentBridgeMissing'), 'error')
  })

  it('posts setEnvironment payload to the iOS bridge when switching to sandbox', async () => {
    window.__nativePlatform = 'ios'
    const postMessage = vi.fn()
    window.webkit = { messageHandlers: { fmioBridge: { postMessage } } }
    const page = new GeneralAdminPage()

    document.body.innerHTML = `
      <select id="${page._iosEnvSelectId}">
        <option value="production"></option>
        <option value="sandbox" selected></option>
      </select>
    `

    await page._switchIosEnvironment()
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'setEnvironment', env: 'sandbox' }))
  })

  it('no-ops when the selected env matches the current env', async () => {
    window.__nativePlatform = 'ios'
    window.__nativeEnvironment = 'sandbox'
    const postMessage = vi.fn()
    window.webkit = { messageHandlers: { fmioBridge: { postMessage } } }
    const page = new GeneralAdminPage()

    document.body.innerHTML = `
      <select id="${page._iosEnvSelectId}">
        <option value="production"></option>
        <option value="sandbox" selected></option>
      </select>
    `

    await page._switchIosEnvironment()
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('reverts the select value when the user cancels the confirm dialog', async () => {
    window.__nativePlatform = 'ios'
    const postMessage = vi.fn()
    window.webkit = { messageHandlers: { fmioBridge: { postMessage } } }
    showDialog.mockResolvedValueOnce({ ok: false, value: undefined })
    const page = new GeneralAdminPage()

    document.body.innerHTML = `
      <select id="${page._iosEnvSelectId}">
        <option value="production"></option>
        <option value="sandbox" selected></option>
      </select>
    `

    await page._switchIosEnvironment()
    expect(postMessage).not.toHaveBeenCalled()
    expect(document.getElementById(page._iosEnvSelectId).value).toBe('production')
  })
})
