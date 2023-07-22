import { server } from '../lib/gateway.js'
import { euroFormat } from '../util/currency.js'

export async function balanceSpan () {
  const data = await server.getMyTeam()
  const balance = euroFormat.format(data.team.balance)
  return `
    <span>${balance}</span>
  `
}
