import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../partials/emblem.js', () => ({
  renderEmblem: vi.fn(() => '<svg class="emblem"></svg>')
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

vi.mock('../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn()
}))

vi.mock('../../partials/gameModal.js', () => ({
  showGameModal: vi.fn()
}))

vi.mock('../../partials/headToHeadOverlay.js', () => ({
  showHeadToHeadOverlay: vi.fn()
}))

import { GameSlider } from '../../partials/gameSlider.js'
import { showGameModal } from '../../partials/gameModal.js'
import { showHeadToHeadOverlay } from '../../partials/headToHeadOverlay.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GameSlider', () => {
  it('shows "-" instead of 0:0 for cup byes', () => {
    const byeGame = {
      id: 1,
      team1Id: 42,
      team2Id: null,
      team1: 'My Team',
      team1Data: { name: 'My Team' },
      team2Data: {},
      goalsTeam1: 0,
      goalsTeam2: 0,
      isPlayed: true,
      isCup: true,
      cupRound: 64,
      totalRounds: 7,
      playedAt: null
    }

    const slider = new GameSlider({ games: [byeGame], teamId: 42 })
    const html = slider.template

    expect(html).toContain('<span class="badge bg-info">-</span>')
    expect(html).not.toContain('0:0')
  })

  it('shows the score for played non-bye cup games', () => {
    const playedGame = {
      id: 2,
      team1Id: 42,
      team2Id: 99,
      team1: 'My Team',
      team2: 'Other Team',
      team1Data: { name: 'My Team' },
      team2Data: { name: 'Other Team' },
      goalsTeam1: 3,
      goalsTeam2: 1,
      isPlayed: true,
      isCup: true,
      cupRound: 32,
      totalRounds: 7,
      playedAt: null
    }

    const slider = new GameSlider({ games: [playedGame], teamId: 42 })
    const html = slider.template

    expect(html).toContain('<span class="badge bg-info">3:1</span>')
  })

  it('links each team column to its team page', () => {
    const game = {
      id: 3,
      team1Id: 42,
      team2Id: 99,
      team1: 'My Team',
      team2: 'Other Team',
      team1Data: { name: 'My Team' },
      team2Data: { name: 'Other Team' },
      isPlayed: false,
      gameDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    }

    const slider = new GameSlider({ games: [game], teamId: 42 })
    const html = slider.template

    // Team columns navigate to the respective team pages.
    expect(html).toContain('href="#team?id=42"')
    expect(html).toContain('href="#team?id=99"')
    // The center no longer links anywhere (it opens a modal/overlay via JS).
    expect(html).not.toContain('game_id=')
    expect(html).not.toContain('href="#results')
  })

  it('opens the game-details modal when the center of a played game is clicked', () => {
    const playedGame = {
      id: 7,
      team1Id: 42,
      team2Id: 99,
      team1: 'My Team',
      team2: 'Other Team',
      team1Data: { name: 'My Team' },
      team2Data: { name: 'Other Team' },
      goalsTeam1: 2,
      goalsTeam2: 0,
      isPlayed: true,
      playedAt: null
    }

    const slider = new GameSlider({ games: [playedGame], teamId: 42 })
    slider._handleCenterClick(playedGame, false)

    expect(showGameModal).toHaveBeenCalledWith(7)
    expect(showHeadToHeadOverlay).not.toHaveBeenCalled()
  })

  describe('initial slide positioning', () => {
    /**
     * Render a 3-game slider into the DOM and fake the layout of its track,
     * since jsdom does no layout at all.
     * @param {boolean} laidOut - whether the track has a box (i.e. is visible)
     */
    function renderSlider (laidOut) {
      const games = [1, 2, 3].map((n) => ({
        id: n,
        team1Id: 42,
        team2Id: 90 + n,
        team1: 'My Team',
        team2: 'Other Team ' + n,
        team1Data: { name: 'My Team' },
        team2Data: { name: 'Other Team ' + n },
        goalsTeam1: n,
        goalsTeam2: 0,
        isPlayed: true,
        playedAt: null
      }))
      const slider = new GameSlider({ games, teamId: 42, initialIndex: 2 })
      document.body.innerHTML = `<div>${slider.template}</div>`
      const track = document.querySelector('.game-slider-track')
      const slides = track.querySelectorAll('.game-slider-slide')
      const layout = { laidOut }
      const SLIDE_WIDTH = 300
      Object.defineProperty(track, 'clientWidth', {
        configurable: true,
        get: () => layout.laidOut ? SLIDE_WIDTH : 0
      })
      slides.forEach((slide, idx) => {
        Object.defineProperty(slide, 'offsetLeft', {
          configurable: true,
          get: () => layout.laidOut ? idx * SLIDE_WIDTH : 0
        })
      })
      // jsdom's scrollLeft is not backed by layout, so record writes ourselves.
      const scroll = { left: 0 }
      Object.defineProperty(track, 'scrollLeft', {
        configurable: true,
        get: () => scroll.left,
        set: (v) => { scroll.left = v }
      })
      return {
        slider,
        track,
        layout,
        scroll,
        SLIDE_WIDTH
      }
    }

    it('scrolls to the initial slide when the track already has a layout box', () => {
      const { slider, scroll, SLIDE_WIDTH } = renderSlider(true)
      slider._setupScrollSnap()
      expect(scroll.left).toBe(2 * SLIDE_WIDTH)
    })

    it('scrolls to the initial slide once a hidden track becomes visible', () => {
      const observers = []
      const originalResizeObserver = globalThis.ResizeObserver
      globalThis.ResizeObserver = class {
        constructor (callback) {
          this.callback = callback
          observers.push(this)
        }
        observe () {}
        disconnect () { this.disconnected = true }
      }
      try {
        // Mounted while the page wrapper is still display:none (router slide
        // transition) — no layout, so the scroll position cannot be applied yet.
        const { slider, layout, scroll, SLIDE_WIDTH } = renderSlider(false)
        slider._setupScrollSnap()
        expect(scroll.left).toBe(0)
        expect(observers).toHaveLength(1)

        // Wrapper becomes visible: the observer fires and positions the track.
        layout.laidOut = true
        observers[0].callback()
        expect(scroll.left).toBe(2 * SLIDE_WIDTH)
        expect(observers[0].disconnected).toBe(true)
      } finally {
        globalThis.ResizeObserver = originalResizeObserver
      }
    })
  })

  it('opens the head-to-head overlay when the center of an upcoming game is clicked', () => {
    const upcomingGame = {
      id: 8,
      team1Id: 42,
      team2Id: 99,
      team1: 'My Team',
      team2: 'Other Team',
      team1Data: { name: 'My Team' },
      team2Data: { name: 'Other Team' },
      isPlayed: false,
      gameDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    }

    const slider = new GameSlider({ games: [upcomingGame], teamId: 42 })
    slider._handleCenterClick(upcomingGame, false)

    expect(showHeadToHeadOverlay).toHaveBeenCalledWith(42, 99)
  })
})
