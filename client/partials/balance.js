import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { euroFormat } from '../lib/currency.js'

export class Balance extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    try {
      const { balance } = await server.getMyBalance()
      this.balance = balance
    } catch {
      this.balance = 0
    }
  }
  /**
   * @returns {string}
   */
  get template () {
    return `<span>${euroFormat.format(this.balance)}</span>`
  }
  /**
   * Server events to listen for
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      BALANCE_UPDATED: () => this.update(true)
    }
  }
  balance = 0
  
}

/**
 * @returns {string}
 */
export function balanceSpan () {
  return new Balance().toString()
}
