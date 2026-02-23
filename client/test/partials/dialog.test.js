import { beforeEach, describe, expect, it, vi } from 'vitest'
import { showDialog } from '../../partials/dialog.js'
import { showOverlay } from '../../partials/overlay.js'
import { _clearHandlers, _getClickHandler, onClick } from '../../lib/htmlEventHandlers.js'
import { renderCurrencyInput, setupCurrencyInput } from '../../partials/currencyInput.js'
import { el } from '../../lib/html.js'

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

vi.mock('../../partials/currencyInput.js', () => ({
  renderCurrencyInput: vi.fn((id, placeholder) => `<div class="input-group"><input type="text" inputmode="numeric" id="${id}" class="form-control" placeholder="${placeholder}" data-raw-value="0"><div class="input-group-append"><span class="input-group-text">,00 €</span></div></div>`),
  setupCurrencyInput: vi.fn()
}))

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

    it('renders currency input when inputType is currency', async () => {
      showDialog({
        title: 'Enter Price',
        text: 'How much?',
        buttonText: 'Submit',
        hasInput: true,
        inputType: 'currency',
        inputLabel: 'Price'
      })

      expect(renderCurrencyInput).toHaveBeenCalled()
      expect(setupCurrencyInput).toHaveBeenCalled()
      const overlayContent = showOverlay.mock.calls[0][2]
      expect(overlayContent).toContain('input-group')
      expect(overlayContent).toContain(',00 €')
      expect(overlayContent).toContain('inputmode="numeric"')
    })

    it('reads raw value from dataset for currency input on submit', async () => {
      el.mockImplementation((_selector) => {
        return { value: '1.000', dataset: { rawValue: '1000' } }
      })

      const promise = showDialog({
        title: 'Enter Price',
        text: 'How much?',
        buttonText: 'Submit',
        hasInput: true,
        inputType: 'currency',
        inputLabel: 'Price'
      })

      // The submit button is the second onClick call (cancel is first)
      const submitId = onClick.mock.calls[1][0]
      _getClickHandler(submitId)()

      const result = await promise
      expect(result).toEqual({ ok: true, value: '1000' })
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
