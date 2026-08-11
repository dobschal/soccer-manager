import { describe, it, expect, beforeEach } from 'vitest'
import { startedInsideScrollableContent } from '../../partials/overlay.js'

/**
 * jsdom reports 0 for every layout property, so the scroll geometry has to be
 * stubbed per element.
 * @param {HTMLElement} element
 * @param {{scrollHeight?: number, clientHeight?: number, scrollTop?: number}} geometry
 * @returns {HTMLElement}
 */
function withScroll (element, { scrollHeight = 0, clientHeight = 0, scrollTop = 0 }) {
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true })
  Object.defineProperty(element, 'scrollTop', { value: scrollTop, configurable: true, writable: true })
  return element
}

let card
let list
let bubble

beforeEach(() => {
  document.body.innerHTML = `
    <div id="card">
      <div id="list"><div id="bubble">Hi</div></div>
    </div>
  `
  card = withScroll(document.getElementById('card'), { scrollHeight: 500, clientHeight: 500 })
  list = withScroll(document.getElementById('list'), { scrollHeight: 900, clientHeight: 300 })
  bubble = document.getElementById('bubble')
})

describe('startedInsideScrollableContent (#541)', () => {
  it('claims the gesture for a nested list that is scrolled down', () => {
    list.scrollTop = 240
    expect(startedInsideScrollableContent(bubble, card)).toBe(true)
  })

  it('lets the overlay have the gesture when the nested list is at its top', () => {
    list.scrollTop = 0
    expect(startedInsideScrollableContent(bubble, card)).toBe(false)
  })

  it('lets the overlay have the gesture when the nested list cannot scroll', () => {
    withScroll(list, { scrollHeight: 200, clientHeight: 300, scrollTop: 0 })
    expect(startedInsideScrollableContent(bubble, card)).toBe(false)
  })

  it('stops walking at the overlay card itself', () => {
    // The card being scrolled is the overlay's own business, not a nested list.
    withScroll(card, { scrollHeight: 900, clientHeight: 300, scrollTop: 100 })
    list.scrollTop = 0
    expect(startedInsideScrollableContent(bubble, card)).toBe(false)
  })

  it('finds a scrollable ancestor several levels up', () => {
    const deep = document.createElement('span')
    bubble.appendChild(deep)
    list.scrollTop = 50
    expect(startedInsideScrollableContent(deep, card)).toBe(true)
  })

  it('handles a touch on the card itself', () => {
    expect(startedInsideScrollableContent(card, card)).toBe(false)
  })

  it('handles a missing or non-element target', () => {
    expect(startedInsideScrollableContent(null, card)).toBe(false)
    expect(startedInsideScrollableContent(undefined, card)).toBe(false)
  })

  it('does not loop forever for a node outside the card', () => {
    const orphan = withScroll(document.createElement('div'), { scrollHeight: 0, clientHeight: 0 })
    document.body.appendChild(orphan)
    expect(startedInsideScrollableContent(orphan, card)).toBe(false)
  })
})
