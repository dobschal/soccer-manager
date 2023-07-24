import { el, generateId } from '../lib/html.js'

let canvasId
/** @type {FinanceLogType[]} */
let logItems

/**
 * @param {FinanceLogType[]} l
 */
export function drawBalanceChart (l) {
  logItems = JSON.parse(JSON.stringify(l))
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
  ctx.beginPath()
  let i = 0
  for (const logItem of logItems) {
    const y = height - (logItem.balance / highestBalance) * (height - 40)
    const x = i * xStep + 20
    if (i === 0) {
      ctx.moveTo(x, y)
    }
    ctx.lineTo(x, y)
    ctx.strokeStyle = logItem.balance > logItems[Math.max(0, i - 1)].balance ? '#00FF00' : '#FF0000'
    ctx.stroke()
    i++
  }
  ctx.closePath()
}
