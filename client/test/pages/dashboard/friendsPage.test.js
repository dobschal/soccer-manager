import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getFriendsOverview: vi.fn(),
    addFriend: vi.fn(),
    removeFriend: vi.fn()
  }
}))

vi.mock('../../../partials/emblem.js', () => ({
  renderEmblem: () => '<emblem/>'
}))

vi.mock('../../../util/league.js', () => ({
  formatLeague: (level, league) => `${level + 1}. ${league}`
}))

vi.mock('../../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('btn-id'),
  el: vi.fn()
}))

vi.mock('../../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn()
}))

vi.mock('../../../i18n/index.js', () => ({
  t: (key) => key
}))

vi.mock('../../../partials/toast.js', () => ({ toast: vi.fn() }))

vi.mock('../../../partials/inviteFriendOverlay.js', () => ({
  showInviteFriendOverlay: vi.fn()
}))

const { FriendsPage } = await import('../../../pages/dashboard/friendsPage.js')
const { server } = await import('../../../lib/gateway.js')

function buildEntry (overrides = {}) {
  return {
    userId: 2,
    username: 'alice',
    avatar: 'a.jpg',
    team: {
      id: 10, name: 'FC Alice', shortName: 'ALI', emblem: 'em',
      color: '#fff', level: 1, league: 0
    },
    position: 3,
    lastGame: {
      id: 99, gameDay: 5, season: 3, goalsTeam1: 2, goalsTeam2: 1,
      gameType: 'league', team1Id: 10, team2Id: 20,
      team1Name: 'FC Alice', team1ShortName: 'ALI',
      team2Name: 'FC Bob', team2ShortName: 'BOB'
    },
    status: 'mutual',
    ...overrides
  }
}

describe('FriendsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when there are no entries', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    const page = new FriendsPage()
    await page.load()
    const html = page.template
    expect(html).toContain('friends.empty')
    expect(html).not.toContain('friends-table')
  })

  it('renders rows with team, league, position and last game links', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [buildEntry()] })
    const page = new FriendsPage()
    await page.load()
    const html = page.template

    expect(html).toContain('friends-table')
    expect(html).toContain('#team?id=10')
    expect(html).toContain('#results?level=1&league=0')
    expect(html).toContain('#results?game_id=99')
    // Win for the friend (2:1) — must render success color
    expect(html).toContain('text-success')
    expect(html).toContain('2:1')
  })

  it('shows accept/decline buttons for incoming-only requests', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({
      entries: [buildEntry({ status: 'incoming', team: null, position: null, lastGame: null })]
    })
    const page = new FriendsPage()
    await page.load()
    const html = page.template

    expect(html).toContain('friends.accept')
    expect(html).toContain('friends.decline')
    expect(html).toContain('friends.incoming')
    expect(html).toContain('friends.noTeam')
  })

  it('renders an invite-card at the bottom of the page', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    const page = new FriendsPage()
    await page.load()
    const html = page.template
    expect(html).toContain('invite-card')
    expect(html).toContain('referral.inviteFriendShort')
  })

  it('marks a defeat with the danger color', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({
      entries: [buildEntry({
        lastGame: {
          id: 50, goalsTeam1: 0, goalsTeam2: 3, team1Id: 10, team2Id: 20,
          team1Name: 'FC Alice', team1ShortName: 'ALI',
          team2Name: 'FC Bob', team2ShortName: 'BOB',
          gameType: 'league', gameDay: 4, season: 3
        }
      })]
    })
    const page = new FriendsPage()
    await page.load()
    const html = page.template
    expect(html).toContain('text-danger')
    expect(html).toContain('0:3')
  })
})
