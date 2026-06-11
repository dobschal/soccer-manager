import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn(), onClose: vi.fn() }))
}))

vi.mock('../../lib/gateway.js', () => ({
  server: { setEmail: vi.fn() },
  showServerError: vi.fn()
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: (k) => k
}))

import { showOverlay } from '../../partials/overlay.js'
import { _resetEmailPromptForTests, maybeShowEmailPrompt } from '../../partials/emailPromptDialog.js'

describe('maybeShowEmailPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetEmailPromptForTests()
  })

  it('shows the overlay when the user has no email at all', () => {
    maybeShowEmailPrompt({ email: null, pending_email: null })
    expect(showOverlay).toHaveBeenCalledTimes(1)
  })

  it('skips when the user already has a verified email', () => {
    maybeShowEmailPrompt({ email: 'a@b.com', pending_email: null })
    expect(showOverlay).not.toHaveBeenCalled()
  })

  it('skips when the user has a pending email change', () => {
    maybeShowEmailPrompt({ email: null, pending_email: 'a@b.com' })
    expect(showOverlay).not.toHaveBeenCalled()
  })

  it('skips on subsequent calls in the same session', () => {
    maybeShowEmailPrompt({ email: null, pending_email: null })
    maybeShowEmailPrompt({ email: null, pending_email: null })
    expect(showOverlay).toHaveBeenCalledTimes(1)
  })

  it('handles missing user gracefully', () => {
    maybeShowEmailPrompt(null)
    maybeShowEmailPrompt(undefined)
    expect(showOverlay).not.toHaveBeenCalled()
  })
})
