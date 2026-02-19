import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-toast-id'),
  el: vi.fn((query) => document.querySelector(query))
}))

vi.mock('../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn()
}))

import { toast } from '../../partials/toast.js'
import { el } from '../../lib/html.js'

describe('toast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds toast element to document body', () => {
    toast('Test message')
    expect(document.body.innerHTML).toContain('Test message')
    expect(document.body.innerHTML).toContain('toast')
  })

  it('renders with default info style (bg-dark)', () => {
    toast('Info message')
    expect(document.body.innerHTML).toContain('bg-dark')
  })

  it('renders with error style (bg-danger)', () => {
    toast('Error message', 'error')
    expect(document.body.innerHTML).toContain('bg-danger')
  })

  it('renders with success style (bg-success)', () => {
    toast('Success message', 'success')
    expect(document.body.innerHTML).toContain('bg-success')
  })

  it('renders with text-white class', () => {
    toast('Message')
    expect(document.body.innerHTML).toContain('text-white')
  })

  it('renders with show class', () => {
    toast('Message')
    expect(document.body.innerHTML).toContain('show')
  })

  it('removes toast after 5 seconds', () => {
    const mockElement = { remove: vi.fn() }
    el.mockImplementation((query) => {
      if (query === '#test-toast-id') return mockElement
      return document.querySelector(query)
    })

    toast('Message')

    // Fast-forward 5 seconds
    vi.advanceTimersByTime(5000)

    expect(el).toHaveBeenCalledWith('#test-toast-id')
    expect(mockElement.remove).toHaveBeenCalled()
  })
})
