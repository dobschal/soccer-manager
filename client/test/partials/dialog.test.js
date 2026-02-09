import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({
    remove: vi.fn()
  }))
}))

vi.mock('../../lib/html.js', () => {
  let idCounter = 0
  return {
    generateId: vi.fn(() => `test-id-${idCounter++}`),
    el: vi.fn((selector) => {
      if (selector.includes('input')) {
        return { value: 'test-input-value' }
      }
      return null
    })
  }
})

vi.mock('../../lib/htmlEventHandlers.js', () => {
  const clickHandlers = {}
  return {
    onClick: vi.fn((id, handler) => {
      clickHandlers[id] = handler
    }),
    _getClickHandler: (id) => clickHandlers[id],
    _clearHandlers: () => {
      Object.keys(clickHandlers).forEach(key => delete clickHandlers[key])
    }
  }
})

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

import { showDialog } from '../../partials/dialog.js'
import { showOverlay } from '../../partials/overlay.js'
import { onClick, _clearHandlers } from '../../lib/htmlEventHandlers.js'

describe('dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _clearHandlers()
  })

  describe('showDialog', () => {
    it('creates overlay with title and text', async () => {
      showDialog({
        title: 'Test Title',
        text: 'Test message',
        buttonText: 'OK'
      })

      expect(showOverlay).toHaveBeenCalledWith(
        'Test Title',
        '',
        expect.stringContaining('Test message')
      )
    })

    it('includes cancel button', async () => {
      showDialog({
        title: 'Test',
        text: 'Message',
        buttonText: 'Confirm'
      })

      const overlayContent = showOverlay.mock.calls[0][2]
      expect(overlayContent).toContain('btn-secondary')
      expect(overlayContent).toContain('dialog.cancel')
    })

    it('includes submit button with custom text', async () => {
      showDialog({
        title: 'Test',
        text: 'Message',
        buttonText: 'Custom Submit'
      })

      const overlayContent = showOverlay.mock.calls[0][2]
      expect(overlayContent).toContain('Custom Submit')
      expect(overlayContent).toContain('btn-primary')
    })

    it('uses custom button type', async () => {
      showDialog({
        title: 'Test',
        text: 'Message',
        buttonText: 'Delete',
        buttonType: 'danger'
      })

      const overlayContent = showOverlay.mock.calls[0][2]
      expect(overlayContent).toContain('btn-danger')
    })

    it('shows input field when hasInput is true', async () => {
      showDialog({
        title: 'Enter Value',
        text: 'Please enter:',
        buttonText: 'Submit',
        hasInput: true,
        inputLabel: 'Value'
      })

      const overlayContent = showOverlay.mock.calls[0][2]
      expect(overlayContent).not.toContain('class="hidden"')
      expect(overlayContent).toContain('placeholder="Value"')
    })

    it('hides input field when hasInput is false', async () => {
      showDialog({
        title: 'Confirm',
        text: 'Are you sure?',
        buttonText: 'Yes',
        hasInput: false
      })

      const overlayContent = showOverlay.mock.calls[0][2]
      expect(overlayContent).toContain('class="hidden"')
    })

    it('uses custom input type', async () => {
      showDialog({
        title: 'Enter Number',
        text: 'Please enter:',
        buttonText: 'Submit',
        hasInput: true,
        inputType: 'number'
      })

      const overlayContent = showOverlay.mock.calls[0][2]
      expect(overlayContent).toContain('type="number"')
    })

    it('defaults to text input type', async () => {
      showDialog({
        title: 'Enter',
        text: 'Please enter:',
        buttonText: 'Submit',
        hasInput: true
      })

      const overlayContent = showOverlay.mock.calls[0][2]
      expect(overlayContent).toContain('type="text"')
    })

    it('includes secondary button when provided', async () => {
      showDialog({
        title: 'Confirm',
        text: 'Choose action',
        buttonText: 'Primary',
        secondaryButtonText: 'Secondary Action',
        secondaryButtonType: 'warning'
      })

      const overlayContent = showOverlay.mock.calls[0][2]
      expect(overlayContent).toContain('Secondary Action')
      expect(overlayContent).toContain('btn-warning')
    })

    it('does not include secondary button when not provided', async () => {
      showDialog({
        title: 'Confirm',
        text: 'Choose action',
        buttonText: 'Primary'
      })

      const overlayContent = showOverlay.mock.calls[0][2]
      // Only 2 buttons: cancel and submit
      const buttonMatches = overlayContent.match(/class="btn/g)
      expect(buttonMatches).toHaveLength(2)
    })

    it('registers click handlers', async () => {
      showDialog({
        title: 'Test',
        text: 'Message',
        buttonText: 'OK'
      })

      // Should register handlers for cancel and submit buttons
      expect(onClick).toHaveBeenCalledTimes(2)
    })

    it('registers three click handlers when secondary button present', async () => {
      showDialog({
        title: 'Test',
        text: 'Message',
        buttonText: 'OK',
        secondaryButtonText: 'Maybe'
      })

      expect(onClick).toHaveBeenCalledTimes(3)
    })
  })

  describe('button text defaults', () => {
    it('defaults buttonText to OK when not provided', async () => {
      showDialog({
        title: 'Test',
        text: 'Message'
      })

      const overlayContent = showOverlay.mock.calls[0][2]
      expect(overlayContent).toContain('OK')
    })
  })
})
