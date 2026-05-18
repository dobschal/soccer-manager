import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../../setup.js'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getMyTeam: vi.fn(),
    getCurrentGameday: vi.fn(),
    updateEmblem: vi.fn(),
    updateTeamName: vi.fn(),
    getNameLibrary: vi.fn(),
    uploadAvatar: vi.fn(),
    removeAvatar: vi.fn()
  },
  showServerError: vi.fn()
}))

vi.mock('../../../partials/emblem.js', () => ({
  renderEmblem: vi.fn(() => '<svg class="emblem-mock"></svg>')
}))

vi.mock('../../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn() }))
}))

vi.mock('../../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

vi.mock('../../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn(),
  fire: vi.fn()
}))

vi.mock('../../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../../../lib/currency.js', () => ({
  euroFormat: {
    format: vi.fn((val) => `${val} EUR`)
  }
}))

import { ClubInfoPage } from '../../../pages/club/clubInfo.js'
import { server } from '../../../lib/gateway.js'

describe('ClubInfoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads team, user and gameday data', async () => {
    const team = testData.team()
    const players = [testData.player()]
    const user = testData.user()
    server.getMyTeam.mockResolvedValue({ team, players, user })
    server.getCurrentGameday.mockResolvedValue({ season: 2 })

    const page = new ClubInfoPage()
    await page.load()

    expect(page.team).toEqual(team)
    expect(page.players).toEqual(players)
    expect(page.user).toEqual(user)
    expect(page.season).toBe(2)
  })

  it('renders three cards: team info, emblem, coach', async () => {
    const team = testData.team({ name: 'FC Test City', created_at: '2025-01-15T10:00:00.000Z' })
    const players = [
      testData.player({ level: 10, fake: false, carrier_start_season: 0 }),
      testData.player({ level: 20, fake: false, carrier_start_season: 0 })
    ]
    const user = testData.user({ username: 'CoachJoe' })
    server.getMyTeam.mockResolvedValue({ team, players, user })
    server.getCurrentGameday.mockResolvedValue({ season: 1 })

    const page = new ClubInfoPage()
    await page.load()

    const html = page.template
    expect(html).toContain('FC Test City')
    expect(html).toContain('myTeam.teamInfo')
    expect(html).toContain('myTeam.emblem')
    expect(html).toContain('myTeam.coach')
    expect(html).toContain('myTeam.coachSince')
    expect(html).toContain('myTeam.teamValue')
    expect(html).toContain('myTeam.salaryTotal')
    expect(html).toContain('myTeam.avgAge')
    expect(html).toContain('CoachJoe')
    expect(html).toContain('15.01.2025')
    expect(html).toContain('emblem-viewer')
    expect(html).toContain('coach-avatar')
    expect(html).toContain('myTeam.uploadAvatar')
  })

  it('shows the avatar image when the user has one and offers a remove button', async () => {
    const team = testData.team()
    const players = [testData.player({ fake: false })]
    const user = testData.user({ username: 'CoachJoe', avatar: 'abc-123.jpg' })
    server.getMyTeam.mockResolvedValue({ team, players, user })
    server.getCurrentGameday.mockResolvedValue({ season: 1 })

    const page = new ClubInfoPage()
    await page.load()

    const html = page.template
    expect(html).toContain('/uploads/avatars/abc-123.jpg')
    expect(html).toContain('myTeam.changeAvatar')
    expect(html).toContain('myTeam.removeAvatar')
  })

  it('prefixes the avatar URL with the native server URL when running in the native app', async () => {
    const team = testData.team()
    const players = [testData.player({ fake: false })]
    const user = testData.user({ username: 'CoachJoe', avatar: 'abc-123.jpg' })
    server.getMyTeam.mockResolvedValue({ team, players, user })
    server.getCurrentGameday.mockResolvedValue({ season: 1 })

    window.__NATIVE_SERVER_URL = 'https://footballmanager.io'
    try {
      const page = new ClubInfoPage()
      await page.load()

      const html = page.template
      expect(html).toContain('src="https://footballmanager.io/uploads/avatars/abc-123.jpg"')
    } finally {
      delete window.__NATIVE_SERVER_URL
    }
  })

  it('shows the default manager avatar when the user has no avatar', async () => {
    const team = testData.team()
    const players = [testData.player({ fake: false })]
    const user = testData.user({ username: 'CoachJoe', avatar: null })
    server.getMyTeam.mockResolvedValue({ team, players, user })
    server.getCurrentGameday.mockResolvedValue({ season: 1 })

    const page = new ClubInfoPage()
    await page.load()

    const html = page.template
    expect(html).toContain('./assets/avatar-placeholder.svg')
    expect(html).toContain('coach-avatar__img--default')
    expect(html).not.toContain('myTeam.removeAvatar')
  })

  describe('team name editor', () => {
    it('preselects the compound prefix "1. FC" when name is "1. FC <city>"', async () => {
      const { showOverlay } = await import('../../../partials/overlay.js')
      const team = testData.team({ name: '1. FC Berlin' })
      const players = [testData.player({ fake: false })]
      const user = testData.user()
      server.getMyTeam.mockResolvedValue({ team, players, user })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })
      server.getNameLibrary.mockResolvedValue({
        clubPrefixes1: ['', '1. FC', '2. FC', 'FC', 'SV'],
        clubPrefixes2: ['', 'United', 'Real', 'Power'],
        cityNames: ['Berlin', 'Hamburg']
      })

      const page = new ClubInfoPage()
      await page.load()
      await page._showTeamNameEditor()

      const overlayHtml = showOverlay.mock.calls.at(-1)[2]
      expect(overlayHtml).toMatch(/value="1\. FC"\s+selected/)
      expect(overlayHtml).toMatch(/value="Berlin"\s+selected/)
      expect(overlayHtml).not.toMatch(/value="FC"\s+selected/)
    })

    it('preselects all three slots for 4-token names with a compound prefix', async () => {
      const { showOverlay } = await import('../../../partials/overlay.js')
      const team = testData.team({ name: '1. FC Power Berlin' })
      const players = [testData.player({ fake: false })]
      const user = testData.user()
      server.getMyTeam.mockResolvedValue({ team, players, user })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })
      server.getNameLibrary.mockResolvedValue({
        clubPrefixes1: ['', '1. FC', '2. FC', 'FC', 'SV'],
        clubPrefixes2: ['', 'United', 'Real', 'Power'],
        cityNames: ['Berlin', 'Hamburg']
      })

      const page = new ClubInfoPage()
      await page.load()
      await page._showTeamNameEditor()

      const overlayHtml = showOverlay.mock.calls.at(-1)[2]
      expect(overlayHtml).toMatch(/value="1\. FC"\s+selected/)
      expect(overlayHtml).toMatch(/value="Power"\s+selected/)
      expect(overlayHtml).toMatch(/value="Berlin"\s+selected/)
    })
  })
})
