import { vi, beforeEach, afterEach } from 'vitest'

// Clear mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Helper to create mock request object
export function createMockRequest (options = {}) {
  return {
    user: options.user ?? { id: 1, username: 'testuser' },
    body: options.body ?? {},
    headers: options.headers ?? {}
  }
}

// Test data factories (mirrors client/test/setup.js)
export const testData = {
  team: (overrides = {}) => ({
    id: 1,
    name: 'Test FC',
    color: '#FF0000',
    level: 1,
    league: 1,
    formation: '4-4-2',
    balance: 500000,
    user_id: 1,
    ...overrides
  }),

  user: (overrides = {}) => ({
    id: 1,
    username: 'testuser',
    password: 'hashedpassword',
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
    yellow_cards: 0,
    red_cards: 0,
    is_suspended: false,
    ...overrides
  }),

  actionCard: (overrides = {}) => ({
    id: 1,
    action: 'LEVEL_UP_PLAYER_100',
    team_id: 1,
    ...overrides
  }),

  sponsor: (overrides = {}) => ({
    id: 1,
    name: 'Test Sponsor',
    value: 10000,
    duration: 10,
    team_id: 1,
    ...overrides
  }),

  financeLog: (overrides = {}) => ({
    id: 1,
    value: 5000,
    balance: 100000,
    reason: 'Test transaction',
    game_day: 1,
    season: 0,
    team_id: 1,
    ...overrides
  }),

  stadium: (overrides = {}) => ({
    id: 1,
    team_id: 1,
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
    // Corner stands start unbuilt (size 0) with default price and no roof
    corner_ne_stand_size: 0,
    corner_nw_stand_size: 0,
    corner_se_stand_size: 0,
    corner_sw_stand_size: 0,
    corner_ne_stand_price: 13,
    corner_nw_stand_price: 13,
    corner_se_stand_price: 13,
    corner_sw_stand_price: 13,
    corner_ne_stand_roof: 0,
    corner_nw_stand_roof: 0,
    corner_se_stand_roof: 0,
    corner_sw_stand_roof: 0,
    corner_ne_construction_end_game_day: null,
    corner_ne_construction_end_season: null,
    corner_ne_construction_target_size: null,
    corner_ne_construction_target_roof: null,
    corner_nw_construction_end_game_day: null,
    corner_nw_construction_end_season: null,
    corner_nw_construction_target_size: null,
    corner_nw_construction_target_roof: null,
    corner_se_construction_end_game_day: null,
    corner_se_construction_end_season: null,
    corner_se_construction_target_size: null,
    corner_se_construction_target_roof: null,
    corner_sw_construction_end_game_day: null,
    corner_sw_construction_end_season: null,
    corner_sw_construction_target_size: null,
    corner_sw_construction_target_roof: null,
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

  tradeHistory: (overrides = {}) => ({
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
    team_1_id: 1,
    team_2_id: 2,
    goals_team_1: 2,
    goals_team_2: 1,
    game_day: 1,
    season: 0,
    played: 1,
    level: 1,
    league: 1,
    ...overrides
  }),

  logMessage: (overrides = {}) => ({
    id: 1,
    message: 'Test log message',
    team_id: 1,
    game_day: 1,
    season: 0,
    ...overrides
  }),

  building: (overrides = {}) => ({
    id: 1,
    team_id: 1,
    type: 'training_area',
    level: 1,
    construction_end_game_day: null,
    construction_end_season: null,
    construction_target_level: null,
    ...overrides
  })
}
