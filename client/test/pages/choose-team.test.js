import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getAvailableTeams: vi.fn(),
    chooseTeam: vi.fn()
  }
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../partials/overlay.js', () => ({
  showConfirmDialog: vi.fn()
}))

vi.mock('../../partials/emblem.js', () => ({
  renderEmblem: vi.fn(() => '<svg class="mock-emblem"></svg>')
}))

vi.mock('../../util/league.js', () => ({
  formatLeague: vi.fn((level, league) => `Liga ${level + 1}/${league}`)
}))

vi.mock('../../lib/currency.js', () => ({
  euroFormat: { format: (v) => `${v} €` }
}))

vi.mock('../../lib/router.js', () => ({
  goTo: vi.fn(),
  setHasTeam: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key, params = {}) => Object.keys(params).length === 0
    ? key
    : `${key}:${JSON.stringify(params)}`)
}))

vi.mock('../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn(),
  fire: vi.fn()
}))

import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { showConfirmDialog } from '../../partials/overlay.js'
import { goTo, setHasTeam } from '../../lib/router.js'
import { ChooseTeamPage } from '../../pages/choose-team.js'

function buildTeam (overrides = {}) {
  return {
    id: 1,
    name: 'Bot FC',
    color: '#abcdef',
    emblem: '{}',
    level: 2,
    league: 0,
    value: 12345,
    ...overrides
  }
}

describe('ChooseTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and renders the list of available teams', async () => {
    const team1 = buildTeam({ id: 1, name: 'Alpha FC' })
    const team2 = buildTeam({ id: 2, name: 'Beta FC', value: 99000 })
    server.getAvailableTeams.mockResolvedValue({ teams: [team1, team2] })

    const page = new ChooseTeamPage()
    await page.load()
    const html = page.template

    expect(server.getAvailableTeams).toHaveBeenCalled()
    expect(html).toContain('Alpha FC')
    expect(html).toContain('Beta FC')
    expect(html).toContain('chooseTeam.title')
    expect(html).toContain('chooseTeam.description')
    expect(html).toContain('12345 €')
    expect(html).toContain('99000 €')
  })

  it('renders the empty state when no teams are available', async () => {
    server.getAvailableTeams.mockResolvedValue({ teams: [] })

    const page = new ChooseTeamPage()
    await page.load()

    expect(page.template).toContain('chooseTeam.noTeams')
  })

  it('asks for confirmation, claims the team, and routes to the dashboard', async () => {
    const team = buildTeam({ id: 5, name: 'My Choice FC' })
    server.getAvailableTeams.mockResolvedValue({ teams: [team] })
    server.chooseTeam.mockResolvedValue({ success: true })
    showConfirmDialog.mockResolvedValue(true)

    const page = new ChooseTeamPage()
    await page.load()
    await page._onSelect(5)

    expect(showConfirmDialog).toHaveBeenCalledWith(
      expect.stringContaining('My Choice FC'),
      expect.anything(),
      expect.anything()
    )
    expect(server.chooseTeam).toHaveBeenCalledWith(5)
    expect(setHasTeam).toHaveBeenCalledWith(true)
    expect(goTo).toHaveBeenCalledWith('')
  })

  it('does not call chooseTeam when the user cancels the confirmation', async () => {
    const team = buildTeam({ id: 7 })
    server.getAvailableTeams.mockResolvedValue({ teams: [team] })
    showConfirmDialog.mockResolvedValue(false)

    const page = new ChooseTeamPage()
    await page.load()
    await page._onSelect(7)

    expect(server.chooseTeam).not.toHaveBeenCalled()
    expect(goTo).not.toHaveBeenCalled()
  })

  it('shows a toast when the server rejects chooseTeam', async () => {
    const team = buildTeam({ id: 8 })
    server.getAvailableTeams.mockResolvedValue({ teams: [team] })
    showConfirmDialog.mockResolvedValue(true)
    server.chooseTeam.mockRejectedValue({ message: 'Boom' })

    const page = new ChooseTeamPage()
    page.update = vi.fn().mockResolvedValue()
    await page.load()
    await page._onSelect(8)

    expect(toast).toHaveBeenCalledWith('Boom', 'error')
    expect(setHasTeam).not.toHaveBeenCalled()
    expect(goTo).not.toHaveBeenCalled()
  })
})
