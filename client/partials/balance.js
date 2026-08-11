import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { euroFormat, shortEuroFormat } from '../lib/currency.js'

export class Balance extends UIElement {
  /**
   * @param {{short?: boolean}} [options] - `short` abbreviates the amount
   *   ("2,8 Mio €") for the info bar, where the exact figure does not fit
   *   next to the other items (#523).
   */
  constructor (options = {}) {
    super()
    this.short = options.short === true
  }
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
    const formatted = this.short ? shortEuroFormat(this.balance) : euroFormat.format(this.balance)
    // The full amount stays available on hover / for screen readers.
    return `<span title="${euroFormat.format(this.balance)}">${formatted}</span>`
  }
  /**
   * Server events to listen for
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      BALANCE_UPDATED: () => this.update(true),
      RECONNECTED: () => this.update(true)
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
