import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getAdmins: vi.fn().mockResolvedValue({ admins: [] }),
    getStatistics: vi.fn().mockResolvedValue({ rows: [], total: 0, pageSize: 20 }),
    getTopCountries: vi.fn().mockResolvedValue({ rows: [] }),
    getSuspiciousActions: vi.fn().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 10 }),
    getReportedUsers: vi.fn().mockResolvedValue({ reports: [] }),
    getBlockedEmails: vi.fn().mockResolvedValue({ blocked: [] }),
    blockEmailAddress: vi.fn().mockResolvedValue({ success: true, email: 'x@y.z', affectedUsers: [] }),
    unblockEmailAddress: vi.fn().mockResolvedValue({ success: true, removed: true }),
    getReferralSettings: vi.fn().mockResolvedValue({ action: 'BONUS_100K', options: ['BONUS_100K', 'STAR_PLAYER'] }),
    setReferralBenefit: vi.fn().mockResolvedValue({ success: true, action: 'BONUS_100K' }),
    getNotificationEmails: vi.fn().mockResolvedValue({ rows: [] }),
    sendAdminNotificationEmail: vi.fn().mockResolvedValue({ sent: 0, recipients: 0 })
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

describe('MarketingAdminPage notification email editor', () => {
  beforeEach(() => {
    server.getNotificationEmails.mockResolvedValue({ rows: [] })
    server.sendAdminNotificationEmail.mockResolvedValue({ sent: 5, recipients: 5 })
  })

  it('renders the editor inputs and an empty-history message when no emails were sent', async () => {
    const page = new MarketingAdminPage()
    await page.load()
    const html = page.template
    expect(html).toContain('admin.notificationEmailTitle')
    expect(html).toContain('admin.notificationEmailSubjectLabel')
    expect(html).toContain('admin.notificationEmailBodyLabel')
    expect(html).toContain('admin.notificationEmailImageLabel')
    expect(html).toContain('admin.notificationEmailSendButton')
    expect(html).toContain('admin.notificationEmailHistoryEmpty')
  })

  it('renders the history table with date, subject, recipient and open counts', async () => {
    server.getNotificationEmails.mockResolvedValue({
      rows: [{
        id: 1,
        title: 'Welcome back!',
        recipient_count: 42,
        open_count: 17,
        created_at: '2026-06-03T10:00:00.000Z',
        image_url: 'https://example.com/notification-image/abc'
      }]
    })
    const page = new MarketingAdminPage()
    await page.load()
    const html = page.template
    expect(html).toContain('Welcome back!')
    expect(html).toContain('>42<')
    expect(html).toContain('>17<')
    expect(html).toContain('admin.notificationEmailHistoryDate')
    expect(html).toContain('admin.notificationEmailHistorySubject')
    expect(html).toContain('admin.notificationEmailHistoryRecipients')
    expect(html).toContain('admin.notificationEmailHistoryOpens')
    expect(html).not.toContain('admin.notificationEmailHistoryEmpty')
  })

  it('escapes HTML in stored subjects to prevent XSS in the history table', async () => {
    server.getNotificationEmails.mockResolvedValue({
      rows: [{
        id: 1,
        title: '<script>alert(1)</script>',
        recipient_count: 0,
        open_count: 0,
        created_at: '2026-06-03T10:00:00.000Z',
        image_url: 'https://example.com/notification-image/abc'
      }]
    })
    const page = new MarketingAdminPage()
    await page.load()
    const html = page.template
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('refuses to send when subject or body are missing', async () => {
    const page = new MarketingAdminPage()
    await page.load()
    document.body.innerHTML = `
      <input id="${page._notifTitleId}" value="">
      <textarea id="${page._notifBodyId}"></textarea>
      <button id="${page._notifSendBtnId}"></button>
    `
    page._pendingNotificationImage = { data: 'data:image/png;base64,AAA', type: 'image/png' }
    await page._sendNotificationEmail()
    expect(server.sendAdminNotificationEmail).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('admin.notificationEmailMissingFields', 'error')
  })

  it('refuses to send when no image is selected', async () => {
    const page = new MarketingAdminPage()
    await page.load()
    document.body.innerHTML = `
      <input id="${page._notifTitleId}" value="Hello">
      <textarea id="${page._notifBodyId}">Body</textarea>
      <button id="${page._notifSendBtnId}"></button>
    `
    page._pendingNotificationImage = null
    await page._sendNotificationEmail()
    expect(server.sendAdminNotificationEmail).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('admin.notificationEmailImageMissing', 'error')
  })
})

describe('UserManagementAdminPage suspicious actions table', () => {
  beforeEach(() => {
    server.getAdmins.mockResolvedValue({ admins: [] })
    server.getSuspiciousActions.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 10 })
    server.getReferralSettings.mockResolvedValue({ action: 'BONUS_100K', options: ['BONUS_100K', 'STAR_PLAYER'] })
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

  it('falls back to the team name when the user side has no username (bot team)', async () => {
    server.getSuspiciousActions.mockResolvedValue({
      rows: [{
        type: 'overvalued_trade',
        time: '2026-06-03T10:00:00.000Z',
        description_key: 'admin.fraudDescOvervaluedTrade',
        description_params: { percent: 150, price: 100_000_000, value: 40_000_000 },
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
    expect(html).toContain('<td>Bot Team</td>')
  })

  it('shows an em dash when both username and team_name are missing', async () => {
    server.getSuspiciousActions.mockResolvedValue({
      rows: [{
        type: 'overvalued_trade',
        time: '2026-06-03T10:00:00.000Z',
        description_key: 'admin.fraudDescOvervaluedTrade',
        description_params: { percent: 150, price: 100_000_000, value: 40_000_000 },
        user1: { username: 'seller', team_name: 'Seller FC' },
        user2: { username: null, team_name: null }
      }],
      total: 1,
      page: 1,
      pageSize: 10
    })
    const page = new UserManagementAdminPage()
    await page.load()
    const html = page.template
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

describe('UserManagementAdminPage referral benefit', () => {
  beforeEach(() => {
    server.getAdmins.mockResolvedValue({ admins: [] })
    server.getSuspiciousActions.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 10 })
    server.getReferralSettings.mockResolvedValue({
      action: 'STAR_PLAYER',
      options: ['BONUS_100K', 'STAR_PLAYER', 'MOTIVATING_SPEECH']
    })
  })

  it('renders the referral benefit section with the configured option preselected', async () => {
    const page = new UserManagementAdminPage()
    await page.load()
    const html = page.template
    expect(html).toContain('admin.referralBenefitTitle')
    expect(html).toContain('admin.referralBenefitDescription')
    expect(html).toContain('admin.referralBenefitSave')
    expect(html).toMatch(/<option value="STAR_PLAYER" selected>/)
    expect(html).toMatch(/<option value="BONUS_100K">/)
  })
})

describe('UserManagementAdminPage blocked emails', () => {
  beforeEach(() => {
    server.getAdmins.mockResolvedValue({ admins: [] })
    server.getSuspiciousActions.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 10 })
    server.getReportedUsers.mockResolvedValue({ reports: [] })
    server.getBlockedEmails.mockResolvedValue({ blocked: [] })
  })

  it('renders the empty state when nothing is blocked', async () => {
    const page = new UserManagementAdminPage()
    await page.load()
    const html = page.template
    expect(html).toContain('admin.blockedEmailsTitle')
    expect(html).toContain('admin.blockedEmailsEmpty')
    expect(html).toContain('admin.blockedEmailsBlock')
  })

  it('lists blocked addresses with the account still using them', async () => {
    server.getBlockedEmails.mockResolvedValue({
      blocked: [{
        id: 1,
        email: 'cheater@example.com',
        reason: 'Second account',
        created_at: '2026-08-07T10:00:00.000Z',
        blocked_by: 'Emmo',
        user_id: 42,
        username: 'Cheater'
      }]
    })
    const page = new UserManagementAdminPage()
    await page.load()
    const html = page.template
    expect(html).toContain('cheater@example.com')
    expect(html).toContain('Second account')
    expect(html).toContain('#user?id=42')
    expect(html).toContain('admin.blockedEmailsUnblock')
  })

  it('escapes the email so a crafted address cannot inject markup', async () => {
    server.getBlockedEmails.mockResolvedValue({
      blocked: [{
        id: 1,
        email: '<img src=x onerror=alert(1)>@example.com',
        reason: null,
        created_at: '2026-08-07T10:00:00.000Z',
        blocked_by: 'Emmo',
        user_id: null,
        username: null
      }]
    })
    const page = new UserManagementAdminPage()
    await page.load()
    const html = page.template
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
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
