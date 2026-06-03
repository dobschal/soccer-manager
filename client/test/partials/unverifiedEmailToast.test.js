import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: (k, vars) => vars ? `${k}:${JSON.stringify(vars)}` : k
}))

import { toast } from '../../partials/toast.js'
import {
  _resetUnverifiedEmailToastForTests,
  maybeShowUnverifiedEmailToast
} from '../../partials/unverifiedEmailToast.js'

describe('maybeShowUnverifiedEmailToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetUnverifiedEmailToastForTests()
  })

  it('shows the toast when there is a pending but no verified email', () => {
    maybeShowUnverifiedEmailToast({ email: null, pending_email: 'a@b.com' })
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining('account.emailNotVerifiedToast'),
      'error'
    )
  })

  it('skips when the user has a verified email', () => {
    maybeShowUnverifiedEmailToast({ email: 'a@b.com', pending_email: null })
    expect(toast).not.toHaveBeenCalled()
  })

  it('skips when the user has no email at all', () => {
    maybeShowUnverifiedEmailToast({ email: null, pending_email: null })
    expect(toast).not.toHaveBeenCalled()
  })

  it('skips when the user is changing a verified email', () => {
    maybeShowUnverifiedEmailToast({ email: 'old@b.com', pending_email: 'new@b.com' })
    expect(toast).not.toHaveBeenCalled()
  })

  it('skips on subsequent calls in the same session', () => {
    maybeShowUnverifiedEmailToast({ email: null, pending_email: 'a@b.com' })
    maybeShowUnverifiedEmailToast({ email: null, pending_email: 'a@b.com' })
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('handles missing user gracefully', () => {
    maybeShowUnverifiedEmailToast(null)
    maybeShowUnverifiedEmailToast(undefined)
    expect(toast).not.toHaveBeenCalled()
  })
})
