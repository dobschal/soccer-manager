import { server } from '../lib/gateway.js'
import { euroFormat } from '../util/currency.js'
import { el, generateId } from '../lib/html.js'
import { toast } from './toast.js'

export async function balanceSpan () {
  const id = generateId()
  await _updateBalance(id)
  setInterval(() => _updateBalance(id), 3000)
  return `
    <span id="${id}"></span>
  `
}

async function _updateBalance (id) {
  try {
    const { balance } = await server.getMyBalance()
    if (!balance) return
    el('#' + id).innerText = euroFormat.format(balance)
  } catch (e) {
    toast(e.message ?? 'Could not load balance from server.', 'error')
  }
}
