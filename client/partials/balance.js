import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { euroFormat } from '../lib/currency.js'

export class Balance extends UIElement {
  _pollingInterval = null
  balance = 0

  /**
   * @returns {string}
   */
  get template () {
    return `<span>${euroFormat.format(this.balance)}</span>`
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    try {
      const { balance } = await server.getMyBalance()
      this.balance = balance
    } catch (e) {
      this.balance = 0
    }
  }

  /**
   * @returns {void}
   */
  onMounted () {
    // Start polling every 3 seconds
    this._pollingInterval = setInterval(async () => {
      await this.load()
      await this.update(true)
    }, 3000)
  }

  /**
   * @returns {void}
   */
  onDestroy () {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval)
      this._pollingInterval = null
    }
  }
}

/**
 * @returns {string}
 */
export function balanceSpan () {
  return new Balance().toString()
}
