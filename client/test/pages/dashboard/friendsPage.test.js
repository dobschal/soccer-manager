import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getFriendsOverview: vi.fn(),
    getConversations: vi.fn(),
    addFriend: vi.fn(),
    removeFriend: vi.fn()
  },
  showServerError: vi.fn()
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

vi.mock('../../../partials/chatOverlay.js', () => ({
  CHAT_MESSAGES_READ_EVENT: 'chat-messages-read'
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

function buildConversation (overrides = {}) {
  return {
    userId: 7,
    username: 'bob',
    avatar: 'b.jpg',
    unread: 0,
    lastMessageAt: new Date().toISOString(),
    lastMessage: { text: 'See you tomorrow', hasImage: false, hasAudio: false, fromMe: false },
    ...overrides
  }
}

describe('FriendsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    server.getConversations.mockResolvedValue({ conversations: [] })
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
    // Avatar + name link to the user profile, not the club page
    expect(html).toContain('#user?id=2')
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

  it('renders an invite-card below the friends list', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    const page = new FriendsPage()
    await page.load()
    const html = page.template
    expect(html).toContain('invite-card')
    expect(html).toContain('referral.inviteFriendShort')
    expect(html.indexOf('invite-card')).toBeGreaterThan(html.indexOf('friends.empty'))
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

  it('does not render the removed posts feature anymore', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    const page = new FriendsPage()
    await page.load()
    const html = page.template
    expect(html).not.toContain('friendPosts.')
    expect(html).not.toContain('friend-post')
  })

  it('heads the friends list, not the chat list, with the "friends" title', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [buildEntry()] })
    server.getConversations.mockResolvedValueOnce({ conversations: [buildConversation()] })
    const page = new FriendsPage()
    await page.load()
    const html = page.template

    // The title belongs to the friends section, so it must come after the chats.
    expect(html.indexOf('friends.title')).toBeGreaterThan(html.indexOf('chat.conversations'))
    expect(html.indexOf('friends.title')).toBeLessThan(html.indexOf('friends-table'))
  })

  describe('chat list', () => {
    it('renders the chat list above the friends list', async () => {
      server.getFriendsOverview.mockResolvedValueOnce({ entries: [buildEntry()] })
      server.getConversations.mockResolvedValueOnce({ conversations: [buildConversation()] })
      const page = new FriendsPage()
      await page.load()
      const html = page.template

      expect(html).toContain('chat-list-item')
      expect(html).toContain('bob')
      expect(html).toContain('See you tomorrow')
      expect(html.indexOf('chat-list-item')).toBeLessThan(html.indexOf('friends-table'))
    })

    it('highlights conversations with unread messages', async () => {
      server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
      server.getConversations.mockResolvedValueOnce({
        conversations: [buildConversation({ unread: 3 })]
      })
      const page = new FriendsPage()
      await page.load()
      const html = page.template

      expect(html).toContain('bg-info-subtle')
      expect(html).toContain('chat-list-item--unread')
      expect(html).toContain('>3</span>')
    })

    it('does not highlight a conversation without unread messages', async () => {
      server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
      server.getConversations.mockResolvedValueOnce({ conversations: [buildConversation()] })
      const page = new FriendsPage()
      await page.load()
      const html = page.template

      expect(html).not.toContain('bg-info-subtle')
    })

    it('previews image and voice messages with a placeholder', async () => {
      server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
      server.getConversations.mockResolvedValueOnce({
        conversations: [
          buildConversation({
            userId: 7,
            lastMessage: { text: null, hasImage: true, hasAudio: false, fromMe: false }
          }),
          buildConversation({
            userId: 8,
            username: 'carol',
            lastMessage: { text: null, hasImage: false, hasAudio: true, fromMe: true }
          })
        ]
      })
      const page = new FriendsPage()
      await page.load()
      const html = page.template

      expect(html).toContain('chat.imageMessage')
      expect(html).toContain('chat.voiceMessage')
      // Own messages are prefixed with "You:"
      expect(html).toContain('chat.previewYou')
    })

    it('shows the chat empty state when there are no conversations', async () => {
      server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
      const page = new FriendsPage()
      await page.load()
      const html = page.template
      expect(html).toContain('chat.empty')
      expect(html).not.toContain('chat-list-item')
    })

    it('shows at most 5 conversations per page and paginates the rest', async () => {
      server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
      server.getConversations.mockResolvedValueOnce({
        conversations: Array.from({ length: 12 }, (_, i) =>
          buildConversation({ userId: 100 + i, username: `chat${i}` }))
      })
      const page = new FriendsPage()
      await page.load()
      const html = page.template

      expect(html.match(/chat-list-item__name/g).length).toBe(5)
      expect(html).toContain('list-pagination')
      expect(html).toContain('1 / 3')
      expect(html).toContain('chat0')
      expect(html).not.toContain('chat5')
    })

    it('renders the requested conversation page', async () => {
      server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
      server.getConversations.mockResolvedValueOnce({
        conversations: Array.from({ length: 12 }, (_, i) =>
          buildConversation({ userId: 100 + i, username: `chat${i}` }))
      })
      const page = new FriendsPage()
      await page.load()
      page._chatsPage = 3
      const html = page.template

      expect(html).toContain('chat10')
      expect(html).toContain('chat11')
      expect(html).not.toContain('chat0<')
      expect(html).toContain('3 / 3')
    })
  })

  describe('friends pagination', () => {
    it('shows at most 7 friends per page', async () => {
      server.getFriendsOverview.mockResolvedValueOnce({
        entries: Array.from({ length: 10 }, (_, i) =>
          buildEntry({ userId: 200 + i, username: `friend${i}`, team: null, position: null, lastGame: null }))
      })
      const page = new FriendsPage()
      await page.load()
      const html = page.template

      expect(html.match(/<tr>/g).length).toBe(8) // 7 rows + header
      expect(html).toContain('list-pagination')
      expect(html).toContain('1 / 2')
      expect(html).toContain('friend6')
      expect(html).not.toContain('friend7')
    })

    it('renders no pagination when everything fits on one page', async () => {
      server.getFriendsOverview.mockResolvedValueOnce({
        entries: [buildEntry()]
      })
      const page = new FriendsPage()
      await page.load()
      const html = page.template

      expect(html).not.toContain('list-pagination')
    })

    it('clamps an out-of-range page back into bounds', async () => {
      server.getFriendsOverview.mockResolvedValueOnce({
        entries: Array.from({ length: 10 }, (_, i) =>
          buildEntry({ userId: 200 + i, username: `friend${i}`, team: null, position: null, lastGame: null }))
      })
      const page = new FriendsPage()
      page._friendsPage = 99
      await page.load()

      expect(page._friendsPage).toBe(2)
    })
  })
})
