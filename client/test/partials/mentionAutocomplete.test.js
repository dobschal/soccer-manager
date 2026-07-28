import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const searchUsersForMention = vi.fn()

vi.mock('../../lib/gateway.js', () => ({
  server: {
    searchUsersForMention: (...args) => searchUsersForMention(...args)
  }
}))

vi.mock('../../i18n/index.js', () => ({
  t: (key) => key
}))

const { attachMentionAutocomplete } = await import('../../partials/mentionAutocomplete.js')

/**
 * Build a textarea wired the way the forum wires it: a submit-on-Enter keydown
 * handler bound directly on the element (bubble phase, registered first), then
 * the mention autocomplete attached on top.
 */
function setup () {
  const input = document.createElement('textarea')
  document.body.appendChild(input)
  const submit = vi.fn()
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  })
  const handle = attachMentionAutocomplete(input)
  return { input, submit, handle }
}

async function type (input, value) {
  input.value = value
  input.setSelectionRange(value.length, value.length)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  // Trigger the debounced server search and flush its promise chain.
  await vi.advanceTimersByTimeAsync(250)
}

function pressEnter (input) {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  return event
}

describe('attachMentionAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    document.body.innerHTML = ''
    searchUsersForMention.mockResolvedValue({ users: [{ username: 'alice' }, { username: 'alina' }] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('selects the highlighted user on Enter WITHOUT submitting the form', async () => {
    const { input, submit, handle } = setup()

    await type(input, 'hi @al')
    // Dropdown is open with suggestions.
    expect(document.querySelector('.mention-autocomplete').hidden).toBe(false)

    pressEnter(input)

    // The form's submit handler must not have run...
    expect(submit).not.toHaveBeenCalled()
    // ...and the highlighted username was inserted with a trailing space.
    expect(input.value).toBe('hi @alice ')

    handle.destroy()
  })

  it('lets Enter submit normally when the dropdown is closed', async () => {
    const { input, submit, handle } = setup()

    // No @-mention in progress -> dropdown stays hidden.
    await type(input, 'just a normal comment')
    expect(document.querySelector('.mention-autocomplete').hidden).toBe(true)

    pressEnter(input)

    expect(submit).toHaveBeenCalledTimes(1)

    handle.destroy()
  })

  it('cycles suggestions with ArrowDown before selecting', async () => {
    const { input, submit, handle } = setup()

    await type(input, '@al')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    pressEnter(input)

    expect(submit).not.toHaveBeenCalled()
    expect(input.value).toBe('@alina ')

    handle.destroy()
  })

  it('removes its document keydown listener on destroy', async () => {
    const { input, submit, handle } = setup()

    await type(input, '@al')
    handle.destroy()

    // With the mention listener gone, Enter reaches the form submit handler again.
    pressEnter(input)
    expect(submit).toHaveBeenCalledTimes(1)
  })
})
