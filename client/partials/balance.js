import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { euroFormat } from '../lib/currency.js'

export class Balance extends UIElement {
  _pollingInterval = null
  balance = 0

  get template () {
    return `<span>${euroFormat.format(this.balance)}</span>`
  }

  async load () {
    try {
      const { balance } = await server.getMyBalance()
      this.balance = balance
    } catch (e) {
      this.balance = 0
    }
  }

  onMounted () {
    // Start polling every 3 seconds
    this._pollingInterval = setInterval(async () => {
      await this.load()
      await this.update(true)
    }, 3000)
  }

  onDestroy () {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval)
      this._pollingInterval = null
    }
  }
}

// Backwards compatibility
export function balanceSpan () {
  return new Balance().toString()
}
