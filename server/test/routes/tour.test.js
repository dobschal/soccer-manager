import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('../../lib/database.js', () => ({ query: vi.fn() }))
vi.mock('../../helper/teamHelper.js', () => ({ getTeam: vi.fn() }))
vi.mock('../../helper/tourHelper.js', () => ({
  getTour: vi.fn(),
  setTourMode: vi.fn(),
  sendPlayersOnTour: vi.fn(),
  recallPlayersFromTour: vi.fn(),
  canRecallFromTour: (p) => p.tour_days_left > 0 && p.tour_days_left === p.tour_days_total,
  tourProgressPerGameDay: (level, avg) => (avg ? level / avg : 0),
  TOURS: [
    { key: 'asia', reward: [{ action: 'MILLION_BONUS', amount: 1 }] },
    { key: 'europe', reward: [{ action: 'LEVEL_UP_PLAYER_100', amount: 4 }] }
  ],
  TOUR_PROGRESS_TARGET: 30,
  TOUR_MIN_DAYS: 3,
  TOUR_MAX_DAYS: 7,
  MAX_PLAYERS_ON_TOUR: 3
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getTour, recallPlayersFromTour, sendPlayersOnTour, setTourMode } from '../../helper/tourHelper.js'
import handlers from '../../routes/tour.js'

const SQUAD = [
  { id: 1, name: 'Keeper', position: 'GK', level: 40, is_injured: 0, is_suspended: 0, tour_days_left: 0, tour_days_total: 0 },
  { id: 2, name: 'Striker', position: 'CA', level: 60, is_injured: 0, is_suspended: 0, tour_days_left: 2, tour_days_total: 5 },
  { id: 3, name: 'Crocked', position: 'CM', level: 50, is_injured: 1, is_suspended: 0, tour_days_left: 0, tour_days_total: 0 }
]

beforeEach(() => {
  vi.clearAllMocks()
  getTeam.mockResolvedValue({ id: 7 })
  getTour.mockResolvedValue({ team_id: 7, mode: 'asia', progress: 12.5 })
  query.mockResolvedValue(SQUAD)
})

describe('tour.getMyTour (#535)', () => {
  it('returns the destination and how full the bar is', async () => {
    const result = await handlers.getMyTour(createMockRequest())
    expect(result.mode).toBe('asia')
    expect(result.progress).toBe(12.5)
    expect(result.target).toBe(30)
  })

  it('reports the free slots left, counting who is already away', async () => {
    const result = await handlers.getMyTour(createMockRequest())
    // One of the three is travelling.
    expect(result.freeSlots).toBe(2)
  })

  it('tells the client what each player would contribute per match day', async () => {
    const result = await handlers.getMyTour(createMockRequest())
    const squadAverage = (40 + 60 + 50) / 3
    const striker = result.players.find(p => p.id === 2)
    expect(striker.progressPerGameDay).toBeCloseTo(60 / squadAverage)
  })

  it('flags injured, suspended and travelling players so the UI can grey them out', async () => {
    const result = await handlers.getMyTour(createMockRequest())
    expect(result.players.find(p => p.id === 3).isInjured).toBe(true)
    expect(result.players.find(p => p.id === 2).tourDaysLeft).toBe(2)
  })

  it('marks a freshly sent player as recallable and a started trip as binding', async () => {
    query.mockResolvedValue([
      ...SQUAD,
      { id: 4, name: 'Fresh', position: 'LM', level: 50, is_injured: 0, is_suspended: 0, tour_days_left: 5, tour_days_total: 5 }
    ])
    const result = await handlers.getMyTour(createMockRequest())
    expect(result.players.find(p => p.id === 4).canRecall).toBe(true)
    expect(result.players.find(p => p.id === 2).canRecall).toBe(false)
  })

  it('lists every destination with its reward', async () => {
    const result = await handlers.getMyTour(createMockRequest())
    expect(result.tours.map(t => t.key)).toEqual(['asia', 'europe'])
    expect(result.tours[1].reward[0]).toEqual({ action: 'LEVEL_UP_PLAYER_100', amount: 4 })
  })

  it('copes with an empty squad', async () => {
    query.mockResolvedValue([])
    const result = await handlers.getMyTour(createMockRequest())
    expect(result.squadAverage).toBe(0)
    expect(result.players).toEqual([])
  })
})

describe('tour.setMyTourMode (#535)', () => {
  it('forwards the choice for the caller\'s own team', async () => {
    setTourMode.mockResolvedValue({ mode: 'europe', progress: 0 })
    const result = await handlers.setMyTourMode('europe', createMockRequest())
    expect(setTourMode).toHaveBeenCalledWith(7, 'europe')
    expect(result).toEqual({ mode: 'europe', progress: 0 })
  })
})

describe('tour.sendPlayersOnTour (#535)', () => {
  it('forwards the selection and duration', async () => {
    sendPlayersOnTour.mockResolvedValue({ sent: 2 })
    const result = await handlers.sendPlayersOnTour([1, 2], 5, createMockRequest())
    expect(sendPlayersOnTour).toHaveBeenCalledWith(7, [1, 2], 5)
    expect(result).toEqual({ sent: 2 })
  })

  it('lets the helper\'s validation errors through', async () => {
    sendPlayersOnTour.mockRejectedValue(new Error('At most 3 players'))
    await expect(handlers.sendPlayersOnTour([1, 2, 3, 4], 5, createMockRequest()))
      .rejects.toThrow('At most 3 players')
  })
})

describe('tour.recallPlayersFromTour (#535)', () => {
  it('forwards the selection for the caller\'s own team', async () => {
    recallPlayersFromTour.mockResolvedValue({ recalled: 1 })
    const result = await handlers.recallPlayersFromTour([4], createMockRequest())
    expect(recallPlayersFromTour).toHaveBeenCalledWith(7, [4])
    expect(result).toEqual({ recalled: 1 })
  })

  it('lets the helper\'s validation errors through', async () => {
    recallPlayersFromTour.mockRejectedValue(new Error('The tour has already started'))
    await expect(handlers.recallPlayersFromTour([2], createMockRequest()))
      .rejects.toThrow('already started')
  })
})
