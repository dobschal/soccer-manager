import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { SERVER_EVENTS } from '../lib/serverEvents.js'

/**
 * Number of playable action cards, shown as an info-bar item next to the
 * balance (#523). Pending cards are deliberately left out — those still have to
 * be claimed before they can be used.
 *
 * Owns its own fetch and its own `ACTION_CARDS_CHANGED` subscription so the
 * count stays live no matter which page the user is on. It lives in the layout,
 * which outlives page navigation.
 */
export class ActionCardCount extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    try {
      const { actionCards } = await server.getActionCards()
      this.count = actionCards?.length || 0
    } catch {
      // The count is cosmetic — never let it break the layout.
      this.count = 0
    }
  }
  /**
   * @returns {string}
   */
  get template () {
    return `<span>${this.count}</span>`
  }
  /**
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      [SERVER_EVENTS.ACTION_CARDS_CHANGED.name]: () => this.update(true),
      RECONNECTED: () => this.update(true)
    }
  }
  count = 0
}
