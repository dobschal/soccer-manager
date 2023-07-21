import { server } from '../lib/gateway.js'

const euroFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR'
})

export async function balanceSpan () {
  const data = await server.getMyTeam()
  const balance = euroFormat.format(data.team.balance)
  return `
    <span>${balance}</span>
  `
}
