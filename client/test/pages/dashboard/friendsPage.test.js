import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getFriendsOverview: vi.fn(),
    getFriendPosts: vi.fn(),
    createFriendPost: vi.fn(),
    toggleFriendPostLike: vi.fn(),
    deleteFriendPost: vi.fn(),
    addFriend: vi.fn(),
    removeFriend: vi.fn(),
    getMyTeam: vi.fn()
  },
  showServerError: vi.fn()
}))

vi.mock('../../../partials/overlay.js', () => ({
  showConfirmDialog: vi.fn()
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

vi.mock('../../../partials/friendPostCommentsOverlay.js', () => ({
  showFriendPostCommentsOverlay: vi.fn()
}))

vi.mock('../../../lib/date.js', () => ({
  formatDate: () => '01.01.2026'
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

function emptyPosts () {
  return { posts: [], page: 1, total: 0, totalPages: 1 }
}

function buildPost (overrides = {}) {
  return {
    id: 500,
    userId: 2,
    username: 'alice',
    avatar: null,
    teamId: 10,
    teamName: 'FC Alice',
    teamShortName: 'ALI',
    teamEmblem: 'em',
    teamColor: '#fff',
    text: 'Hello world',
    imageFilename: null,
    createdAt: '2026-01-01T00:00:00Z',
    likeCount: 2,
    likedByMe: false,
    commentCount: 1,
    ...overrides
  }
}

describe('FriendsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    server.getFriendPosts.mockResolvedValue(emptyPosts())
    server.getMyTeam.mockResolvedValue({ user: { id: 1 } })
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

  it('renders an invite-card below the posts section', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    const page = new FriendsPage()
    await page.load()
    const html = page.template
    expect(html).toContain('invite-card')
    expect(html).toContain('referral.inviteFriendShort')
    // Invite card must appear AFTER the posts section
    expect(html.indexOf('invite-card')).toBeGreaterThan(html.indexOf('friend-posts-section'))
  })

  it('renders the post editor below the post list', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    server.getFriendPosts.mockReset()
    server.getFriendPosts.mockResolvedValueOnce({
      posts: [buildPost()],
      page: 1,
      total: 1,
      totalPages: 1
    })
    const page = new FriendsPage()
    await page.load()
    const html = page.template
    expect(html.indexOf('friend-post-editor')).toBeGreaterThan(html.indexOf('friend-post-list'))
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

  it('renders the posts section with empty state when there are no posts', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    const page = new FriendsPage()
    await page.load()
    const html = page.template
    expect(html).toContain('friendPosts.title')
    expect(html).toContain('friendPosts.empty')
    expect(html).toContain('friendPosts.postPlaceholder')
  })

  it('renders friend posts with like and comment buttons', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    server.getFriendPosts.mockReset()
    server.getFriendPosts.mockResolvedValueOnce({
      posts: [buildPost()],
      page: 1,
      total: 1,
      totalPages: 1
    })

    const page = new FriendsPage()
    await page.load()
    const html = page.template

    expect(html).toContain('Hello world')
    expect(html).toContain('alice')
    // Like count and comment count surface
    expect(html).toContain('>2</span>')
    expect(html).toContain('>1</span>')
    expect(html).toContain('fa-heart-o')
    expect(html).toContain('fa-comment-o')
  })

  it('renders an image when the post has one', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    server.getFriendPosts.mockReset()
    server.getFriendPosts.mockResolvedValueOnce({
      posts: [buildPost({ imageFilename: 'abc.png' })],
      page: 1,
      total: 1,
      totalPages: 1
    })

    const page = new FriendsPage()
    await page.load()
    const html = page.template

    expect(html).toContain('/uploads/friend-posts/abc.png')
    expect(html).toContain('friend-post-image')
  })

  it('shows a delete button on the user\'s own posts', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    server.getMyTeam.mockReset()
    server.getMyTeam.mockResolvedValueOnce({ user: { id: 42 } })
    server.getFriendPosts.mockReset()
    server.getFriendPosts.mockResolvedValueOnce({
      posts: [buildPost({ userId: 42 })],
      page: 1,
      total: 1,
      totalPages: 1
    })

    const page = new FriendsPage()
    await page.load()
    const html = page.template

    expect(html).toContain('friend-post-actions__delete')
    expect(html).toContain('friendPosts.delete')
    expect(html).toContain('fa-trash')
  })

  it('does not render a delete button on someone else\'s post', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    server.getMyTeam.mockReset()
    server.getMyTeam.mockResolvedValueOnce({ user: { id: 1 } })
    server.getFriendPosts.mockReset()
    server.getFriendPosts.mockResolvedValueOnce({
      posts: [buildPost({ userId: 99 })],
      page: 1,
      total: 1,
      totalPages: 1
    })

    const page = new FriendsPage()
    await page.load()
    const html = page.template

    expect(html).not.toContain('friend-post-actions__delete')
    expect(html).not.toContain('fa-trash')
  })

  it('renders pagination controls when more than one page is available', async () => {
    server.getFriendsOverview.mockResolvedValueOnce({ entries: [] })
    server.getFriendPosts.mockReset()
    server.getFriendPosts.mockResolvedValueOnce({
      posts: [buildPost()],
      page: 1,
      total: 25,
      totalPages: 3
    })

    const page = new FriendsPage()
    await page.load()
    const html = page.template

    expect(html).toContain('friend-post-pagination')
    expect(html).toContain('1 / 3')
  })
})
