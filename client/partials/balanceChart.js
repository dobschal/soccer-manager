import { UIElement } from '../lib/UIElement.js'
import { el } from '../lib/html.js'
import { deepCopy } from '../lib/deepCopy.js'

export class BalanceChart extends UIElement {
  /** @type {FinanceLogType[]} */
  logItems = []
  _resizeHandler = null
  _chart = null

  constructor (financeLog = []) {
    super()
    this._processLogItems(financeLog)
  }

  _processLogItems (log) {
    log.forEach(item => {
      const existing = this.logItems.find(
        i => i.game_day === item.game_day && i.season === item.season
      )
      if (existing) {
        existing.balance = item.balance
      } else {
        this.logItems.push(deepCopy(item))
      }
    })
  }

  get template () {
    return `<canvas class="finance-canvas"></canvas>`
  }

  onMounted () {
    this._resizeHandler = this._renderChart.bind(this)
    window.addEventListener('resize', this._resizeHandler)
    this._renderChart()
  }

  onDestroy () {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler)
      this._resizeHandler = null
    }
    if (this._chart) {
      this._chart.destroy()
      this._chart = null
    }
  }

  _renderChart () {
    const canvas = el(`${this._elementQuery} canvas`)
    if (!canvas) return

    if (this._chart) {
      this._chart.destroy()
    }

    this._chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: this.logItems.map(l => '#' + (l.game_day + 1)),
        datasets: [{
          label: 'Balance €',
          data: this.logItems.map(l => l.balance),
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    })
  }
}

/**
 * Backwards compatibility wrapper
 * @param {FinanceLogType[]} l
 */
export function drawBalanceChart (l) {
  return new BalanceChart(l).toString()
}

/** @type {HTMLCanvasElement} */
// const canvas = el('#' + canvasId)
// if (!canvas) return
// const width = canvas.offsetWidth
// const height = canvas.offsetHeight
// canvas.setAttribute('height', height + 'px')
// canvas.setAttribute('width', width + 'px')
// const ctx = canvas.getContext('2d')
// ctx.clearRect(0, 0, width, height)
// let highestBalance = 0
// const xStep = Math.floor(width / logItems.length)
// for (const logItem of logItems) {
//   if (logItem.balance > highestBalance) highestBalance = logItem.balance
// }
//
// // Axis
// ctx.beginPath()
// ctx.moveTo(20, 20)
// ctx.lineTo(20, height - 20)
// ctx.lineTo(width - 20, height - 20)
// ctx.lineWidth = 1
// ctx.strokeStyle = '#000000'
// ctx.stroke()
// ctx.closePath()
//
// // balance
// let i = 0; let x; let y
// for (const logItem of logItems) {
//   ctx.beginPath()
//   ctx.setLineDash([])
//   if (x && y) {
//     ctx.moveTo(x, y)
//   }
//   y = (height - 20) - (logItem.balance / highestBalance) * (height - 40)
//   x = i * xStep + 20
//   ctx.lineTo(x, y)
//   ctx.lineWidth = 2
//   ctx.strokeStyle = logItem.balance > logItems[Math.max(0, i - 1)].balance ? '#00FF00' : '#FF0000'
//   ctx.stroke()
//   ctx.closePath()
//   if (i % 10 === 0 || i === logItems.length - 1) {
//     if (i === logItems.length - 1) {
//       ctx.textAlign = 'right'
//     } else {
//       ctx.textAlign = 'left'
//     }
//     ctx.fillText(euroFormat.format(logItem.balance), x, y - 10)
//     ctx.fillText((logItem.season + 1) + '/' + (logItem.game_day), x, (height - 10))
//     ctx.beginPath()
//     ctx.setLineDash([5, 10])
//     ctx.lineWidth = 1
//     ctx.strokeStyle = '#C0C0C0'
//     ctx.moveTo(x, 20)
//     ctx.lineTo(x, height - 20)
//     ctx.stroke()
//   }
//   i++
