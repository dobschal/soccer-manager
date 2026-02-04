import { vi } from 'vitest'

// Create a mock server with all methods as mocks
export const server = {
  getMyTeam: vi.fn(),
  getActionCards: vi.fn(),
  getCurrentGameday: vi.fn(),
  getResults: vi.fn(),
  getLogMessages: vi.fn(),
  useActionCard: vi.fn(),
  mergeCards: vi.fn(),
  getSponsor: vi.fn(),
  getSponsorOffers: vi.fn(),
  getFinanceLog: vi.fn(),
  chooseSponsor: vi.fn(),
  getMyBalance: vi.fn(),
  getStadium: vi.fn(),
  buildStadium: vi.fn(),
  updatePrices: vi.fn(),
  calculateStadiumPrice: vi.fn(),
  getOffers: vi.fn(),
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
  addTradeOffer: vi.fn(),
  getTradeHistory: vi.fn(),
  getPlayersWithoutTeam: vi.fn(),
  hirePlayer: vi.fn(),
  getPlayerById: vi.fn(),
  getTeam: vi.fn(),
  estimateValue: vi.fn(),
  getPlayerHistory: vi.fn(),
  myOfferForPlayer: vi.fn(),
  firePlayer: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  getNextGameDate: vi.fn(),
  getNextGame: vi.fn(),
  saveLineup: vi.fn(),
  getStanding: vi.fn(),
  getResult: vi.fn(),
  getLeagueNews: vi.fn(),
  isDevelopment: vi.fn(),
  triggerGameDay: vi.fn()
}

export function showServerError (e) {
  console.error('Server Error: ', e)
}
