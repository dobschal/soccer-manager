import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/router.js', () => ({ goTo: vi.fn() }))

import { handleDeepLink } from '../../lib/deepLink.js'
import { goTo } from '../../lib/router.js'

describe('handleDeepLink (#330)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('navigates to a hash with a leading #', () => {
    expect(handleDeepLink('#club?sub_page=buildings')).toBe(true)
    expect(goTo).toHaveBeenCalledWith('club?sub_page=buildings')
  })

  it('navigates to a plain path without #', () => {
    expect(handleDeepLink('results?level=1')).toBe(true)
    expect(goTo).toHaveBeenCalledWith('results?level=1')
  })

  it('strips a leading slash before the hash', () => {
    handleDeepLink('/#dashboard')
    expect(goTo).toHaveBeenCalledWith('dashboard')
  })

  it('ignores empty or non-string values', () => {
    expect(handleDeepLink('')).toBe(false)
    expect(handleDeepLink('   ')).toBe(false)
    expect(handleDeepLink(null)).toBe(false)
    expect(handleDeepLink(undefined)).toBe(false)
    expect(goTo).not.toHaveBeenCalled()
  })
})
