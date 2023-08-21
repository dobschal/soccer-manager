import { el, generateId } from '../lib/html.js'
import { euroFormat } from '../lib/currency.js'

let canvasId
/** @type {FinanceLogType[]} */
let logItems

/**
 * @param {FinanceLogType[]} l
 */
export function drawBalanceChart (l) {
  logItems = JSON.parse(JSON.stringify(l)).slice(-21)
  console.log(logItems)
  canvasId = generateId()
  setTimeout(renderChart)
  window.addEventListener('resize', renderChart)
  return `
    <canvas class="finance-canvas" id="${canvasId}"></canvas>
  `
}

function renderChart () {
  /** @type {HTMLCanvasElement} */
  const canvas = el('#' + canvasId)
  if (!canvas) return
  const width = canvas.offsetWidth
  const height = canvas.offsetHeight
  canvas.setAttribute('height', height + 'px')
  canvas.setAttribute('width', width + 'px')
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, width, height)
  let highestBalance = 0
  const xStep = Math.floor(width / logItems.length)
  for (const logItem of logItems) {
    if (logItem.balance > highestBalance) highestBalance = logItem.balance
  }

  // Axis
  ctx.beginPath()
  ctx.moveTo(20, 20)
  ctx.lineTo(20, height - 20)
  ctx.lineTo(width - 20, height - 20)
  ctx.lineWidth = 1
  ctx.strokeStyle = '#000000'
  ctx.stroke()
  ctx.closePath()

  // balance
  let i = 0; let x; let y
  for (const logItem of logItems) {
    ctx.beginPath()
    ctx.setLineDash([])
    if (x && y) {
      ctx.moveTo(x, y)
    }
    y = (height - 20) - (logItem.balance / highestBalance) * (height - 40)
    x = i * xStep + 20
    ctx.lineTo(x, y)
    ctx.lineWidth = 2
    ctx.strokeStyle = logItem.balance > logItems[Math.max(0, i - 1)].balance ? '#00FF00' : '#FF0000'
    ctx.stroke()
    ctx.closePath()
    if (i % 10 === 0 || i === logItems.length - 1) {
      if (i === logItems.length - 1) {
        ctx.textAlign = 'right'
      } else {
        ctx.textAlign = 'left'
      }
      ctx.fillText(euroFormat.format(logItem.balance), x, y - 10)
      ctx.fillText((logItem.season + 1) + '/' + (logItem.game_day), x, (height - 10))
      ctx.beginPath()
      ctx.setLineDash([5, 10])
      ctx.lineWidth = 1
      ctx.strokeStyle = '#C0C0C0'
      ctx.moveTo(x, 20)
      ctx.lineTo(x, height - 20)
      ctx.stroke()
    }
    i++
  }
}
