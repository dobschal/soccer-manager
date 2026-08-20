import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    hasTeam: vi.fn(),
    getMyTeam: vi.fn(),
    getAvailableLeagues: vi.fn(),
    chooseRandomTeamInLeague: vi.fn(),
    updateTeamName: vi.fn(),
    updateEmblem: vi.fn()
  }
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../partials/emblem.js', () => ({
  renderEmblem: vi.fn(() => '<svg class="mock-emblem"></svg>')
}))

vi.mock('../../partials/emblemEditor.js', () => ({
  openEmblemEditor: vi.fn()
}))

vi.mock('../../util/league.js', () => ({
  formatLeague: vi.fn((level, league) => `Liga ${level + 1}/${league}`)
}))

vi.mock('../../util/team.js', () => ({
  shortenTeamName: vi.fn((name) => name)
}))

vi.mock('../../lib/promoVideo.js', () => ({
  getPromoVideoId: vi.fn(() => 'vid123'),
  renderPromoVideoEmbed: vi.fn(() => '<iframe class="mock-video"></iframe>')
}))

vi.mock('../../lib/router.js', () => ({
  goTo: vi.fn(),
  setHasTeam: vi.fn()
}))

vi.mock('../../lib/freshRegistration.js', () => ({
  markFreshRegistration: vi.fn()
}))

vi.mock('../../lib/html.js', () => ({
  el: vi.fn(() => null),
  generateId: vi.fn(() => 'gen-id'),
  value: vi.fn(() => '')
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key, params = {}) => Object.keys(params).length === 0
    ? key
    : `${key}:${JSON.stringify(params)}`)
}))

import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { openEmblemEditor } from '../../partials/emblemEditor.js'
import { setHasTeam, goTo } from '../../lib/router.js'
import { value } from '../../lib/html.js'
import { markFreshRegistration } from '../../lib/freshRegistration.js'
import { ChooseTeamPage } from '../../pages/choose-team.js'

describe('ChooseTeamPage (post-registration wizard, #453)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.window = global.window || {}
    // Default: fresh user without a team → league selection is shown.
    server.hasTeam.mockResolvedValue({ hasTeam: false })
  })

  it('loads leagues and renders the welcome + video + league list', async () => {
    server.getAvailableLeagues.mockResolvedValue({
      leagues: [
        { level: 2, league: 0, freeTeams: 3 },
        { level: 2, league: 1, freeTeams: 1 }
      ]
    })

    const page = new ChooseTeamPage()
    await page.load()
    const html = page.template

    expect(server.getAvailableLeagues).toHaveBeenCalled()
    expect(html).toContain('chooseTeam.welcomeTitle')
    expect(html).toContain('chooseTeam.welcomeText')
    expect(html).toContain('mock-video')
    expect(html).toContain('Liga 3/0')
    expect(html).toContain('Liga 3/1')
    expect(html).toContain('data-level="2"')
  })

  it('renders the empty state when no leagues are available', async () => {
    server.getAvailableLeagues.mockResolvedValue({ leagues: [] })

    const page = new ChooseTeamPage()
    await page.load()

    expect(page.template).toContain('chooseTeam.noTeams')
  })

  it('skips the league step and shows setup when the user already has a team (reload)', async () => {
    server.hasTeam.mockResolvedValue({ hasTeam: true })
    server.getMyTeam.mockResolvedValue({
      team: { id: 5, name: 'Assigned FC', short_name: 'AFC', emblem: '{}', color: '#fff', level: 2, league: 0 }
    })

    const page = new ChooseTeamPage()
    await page.load()

    expect(server.getAvailableLeagues).not.toHaveBeenCalled()
    expect(setHasTeam).toHaveBeenCalledWith(true)
    expect(page._step).toBe('setup')
    expect(page._team.name).toBe('Assigned FC')
    const html = page.template
    expect(html).toContain('Assigned FC')
    expect(html).toContain('data-open-emblem-editor')
  })

  it('assigns a random team, marks hasTeam and advances to the setup step', async () => {
    server.getAvailableLeagues.mockResolvedValue({ leagues: [{ level: 2, league: 0, freeTeams: 3 }] })
    server.chooseRandomTeamInLeague.mockResolvedValue({
      team: { id: 5, name: 'Random FC', short_name: 'RFC', emblem: '{}', color: '#fff', level: 2, league: 0 }
    })

    const page = new ChooseTeamPage()
    page.update = vi.fn().mockResolvedValue()
    await page.load()
    await page._onSelectLeague(2, 0)

    expect(server.chooseRandomTeamInLeague).toHaveBeenCalledWith(2, 0)
    expect(setHasTeam).toHaveBeenCalledWith(true)
    expect(page._step).toBe('setup')
    expect(page._team.name).toBe('Random FC')
    // Setup step shows the assigned name prefilled and the emblem customize action.
    expect(page.template).toContain('Random FC')
    expect(page.template).toContain('data-open-emblem-editor')
  })

  it('saves the club name and heads straight to the dashboard without opening the editor', async () => {
    server.updateTeamName.mockResolvedValue({ success: true })
    value.mockReturnValueOnce('New Club Name').mockReturnValueOnce('NCN')

    const page = new ChooseTeamPage()
    page.update = vi.fn().mockResolvedValue()
    page._team = { id: 5, name: 'Random FC', short_name: null, emblem: '{}', color: '#fff' }
    page._step = 'setup'
    page._nameInputId = 'name'
    page._shortInputId = 'short'

    await page._onSaveName()

    expect(server.updateTeamName).toHaveBeenCalledWith('New Club Name', 'NCN')
    expect(goTo).toHaveBeenCalledWith('')
    // The emblem editor must NOT auto-open — only via the "customize" button.
    expect(openEmblemEditor).not.toHaveBeenCalled()
    // The dashboard needs to know this is a brand-new manager (#564).
    expect(markFreshRegistration).toHaveBeenCalled()
  })

  it('does not flag a fresh registration when the club name is rejected (#564)', async () => {
    value.mockReturnValue('')

    const page = new ChooseTeamPage()
    page._team = { id: 5, name: 'Random FC' }
    page._step = 'setup'
    page._nameInputId = 'name'
    page._shortInputId = 'short'

    await page._onSaveName()

    expect(markFreshRegistration).not.toHaveBeenCalled()
    expect(goTo).not.toHaveBeenCalled()
  })

  it('rejects an empty club name with a toast and does not finish', async () => {
    value.mockReturnValue('')

    const page = new ChooseTeamPage()
    page.update = vi.fn().mockResolvedValue()
    page._team = { id: 5, name: 'Random FC' }
    page._step = 'setup'
    page._nameInputId = 'name'
    page._shortInputId = 'short'

    await page._onSaveName()

    expect(toast).toHaveBeenCalledWith('myTeam.nameRequired', 'error')
    expect(server.updateTeamName).not.toHaveBeenCalled()
    expect(goTo).not.toHaveBeenCalled()
  })

  it('shows a toast when assigning a random team fails', async () => {
    server.getAvailableLeagues.mockResolvedValue({ leagues: [{ level: 2, league: 0, freeTeams: 1 }] })
    server.chooseRandomTeamInLeague.mockRejectedValue({ message: 'Boom' })

    const page = new ChooseTeamPage()
    page.update = vi.fn().mockResolvedValue()
    await page.load()
    await page._onSelectLeague(2, 0)

    expect(toast).toHaveBeenCalledWith('Boom', 'error')
    expect(setHasTeam).not.toHaveBeenCalled()
    expect(page._step).toBe('league')
  })

  it('opens the emblem editor on demand', async () => {
    const page = new ChooseTeamPage()
    page._team = { id: 5, name: 'Random FC', emblem: '{}', color: '#fff' }
    page._openEmblemEditor()
    expect(openEmblemEditor).toHaveBeenCalledWith(page._team, expect.any(Function))
  })

  it('renders the setup step with name inputs, a customize-emblem button and a finish action', async () => {
    const page = new ChooseTeamPage()
    page._team = { id: 5, name: 'Random FC', emblem: '{}', color: '#fff' }
    page._step = 'setup'
    const html = page.template
    expect(html).toContain('name="rename-team"')
    expect(html).toContain('data-open-emblem-editor')
    expect(html).toContain('chooseTeam.customizeEmblem')
    expect(html).toContain('chooseTeam.toDashboard')
  })
})
