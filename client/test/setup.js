import { vi, beforeEach, afterEach } from 'vitest'

// Reset DOM before each test
beforeEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  vi.clearAllMocks()

  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  }
  Object.defineProperty(window, 'localStorage', { value: localStorageMock })

  // Mock location
  Object.defineProperty(window, 'location', {
    value: {
      hash: '',
      href: 'http://localhost/',
      reload: vi.fn()
    },
    writable: true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Mock fetch globally
global.fetch = vi.fn()

// Helper to create mock server responses
export function mockServerResponse (data) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data)
  })
}

// Test data factories
export const testData = {
  team: (overrides = {}) => ({
    id: 1,
    name: 'Test FC',
    color: '#FF0000',
    level: 1,
    league: 1,
    formation: '4-4-2',
    ...overrides
  }),

  user: (overrides = {}) => ({
    id: 1,
    username: 'testuser',
    ...overrides
  }),

  player: (overrides = {}) => ({
    id: 1,
    name: 'Test Player',
    position: 'CM',
    level: 50,
    freshness: 0.85,
    team_id: 1,
    in_game_position: 'CM',
    birth_season: 0,
    hair_color: 0,
    skin_color: 0,
    ...overrides
  }),

  actionCard: (overrides = {}) => ({
    id: 1,
    action: 'LEVEL_UP_PLAYER_100',
    ...overrides
  }),

  sponsor: (overrides = {}) => ({
    id: 1,
    name: 'Test Sponsor',
    value: 10000,
    duration: 10,
    ...overrides
  }),

  financeLog: (overrides = {}) => ({
    id: 1,
    value: 5000,
    balance: 100000,
    reason: 'Test transaction',
    game_day: 1,
    season: 0,
    ...overrides
  }),

  stadium: (overrides = {}) => ({
    id: 1,
    north_stand_size: 5000,
    south_stand_size: 5000,
    east_stand_size: 5000,
    west_stand_size: 5000,
    north_stand_price: 20,
    south_stand_price: 20,
    east_stand_price: 20,
    west_stand_price: 20,
    north_stand_roof: 0,
    south_stand_roof: 0,
    east_stand_roof: 0,
    west_stand_roof: 0,
    // Construction tracking fields
    north_construction_end_game_day: null,
    north_construction_end_season: null,
    north_construction_target_size: null,
    north_construction_target_roof: null,
    south_construction_end_game_day: null,
    south_construction_end_season: null,
    south_construction_target_size: null,
    south_construction_target_roof: null,
    east_construction_end_game_day: null,
    east_construction_end_season: null,
    east_construction_target_size: null,
    east_construction_target_roof: null,
    west_construction_end_game_day: null,
    west_construction_end_season: null,
    west_construction_target_size: null,
    west_construction_target_roof: null,
    ...overrides
  }),

  constructionInfo: (overrides = {}) => ({
    north: { underConstruction: false },
    south: { underConstruction: false },
    east: { underConstruction: false },
    west: { underConstruction: false },
    ...overrides
  }),

  tradeOffer: (overrides = {}) => ({
    id: 1,
    player_id: 1,
    from_team_id: 1,
    type: 'sell',
    offer_value: 50000,
    ...overrides
  }),

  trade: (overrides = {}) => ({
    id: 1,
    player_id: 1,
    from_team_id: 1,
    to_team_id: 2,
    price: 50000,
    season: 0,
    game_day: 5,
    ...overrides
  }),

  gameResult: (overrides = {}) => ({
    id: 1,
    team1Id: 1,
    team2Id: 2,
    team1: 'Home Team',
    team2: 'Away Team',
    goalsTeam1: 2,
    goalsTeam2: 1,
    gameDay: 1,
    season: 0,
    details: '{}',
    ...overrides
  }),

  newsArticle: (overrides = {}) => ({
    id: 1,
    title: 'Test News',
    text: 'This is test news content',
    playerId: null,
    ...overrides
  })
}

// Helper to wait for async UIElement rendering
export async function waitForRender (ms = 50) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

// Helper to render HTML and return container
export function renderHTML (html) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

// Helper to trigger DOM events
export function triggerEvent (element, eventType, options = {}) {
  const event = new Event(eventType, { bubbles: true, cancelable: true, ...options })
  element.dispatchEvent(event)
  return event
}

// Helper to trigger click
export function click (element) {
  return triggerEvent(element, 'click')
}

// Helper to trigger submit
export function submit (form) {
  const event = new Event('submit', { bubbles: true, cancelable: true })
  form.dispatchEvent(event)
  return event
}
