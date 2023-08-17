import { server } from '../lib/gateway.js'
import { euroFormat } from '../util/currency.js'
import { renderAsync } from '../lib/renderAsync.js'

export const balanceSpan = renderAsync(async function (update) {
  try {
    const { balance } = await server.getMyBalance()
    setTimeout(update, 3000)
    return `<span>${euroFormat.format(balance)}</span>`
  } catch (e) {
    return 'ERROR'
  }
})
