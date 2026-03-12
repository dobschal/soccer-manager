import { Chart } from 'chart.js/auto'
import { UIElement } from '../lib/UIElement.js'
import { el } from '../lib/html.js'
import { deepCopy } from '../lib/deepCopy.js'

export class MiniBalanceChart extends UIElement {
  /**
   * @param {FinanceLogEntry[]} [financeLog]
   */
  constructor (financeLog = []) {
    super()
    this._processLogItems(financeLog)
  }
  /**
   * @returns {string}
   */
  get template () {
    return `<div class="card card-body bg-dark" style="position: relative; height: 180px; width: 100%; padding: 8px; box-sizing: border-box;"><canvas class="mini-finance-canvas"></canvas></div>`
  }
  /**
   * @returns {void}
   */
  onMounted () {
    this._renderChart()
  }
  /**
   * @returns {void}
   */
  onDestroy () {
    if (this._chart) {
      this._chart.destroy()
      this._chart = null
    }
  }
  /** @type {FinanceLogEntry[]} */
  logItems = []

  _chart = null

  /**
   * @param {FinanceLogEntry[]} log
   * @returns {void}
   */
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
    // Sort by season and game_day
    this.logItems.sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season
      return a.game_day - b.game_day
    })
  }

  /**
   * @returns {void}
   */
  /**
   * Format a number in short format (e.g., 5.7m, 120k)
   * @param {number} value
   * @returns {string}
   */
  _formatShort (value) {
    if (Math.abs(value) >= 1000000) {
      return (value / 1000000).toFixed(1) + 'm'
    }
    if (Math.abs(value) >= 1000) {
      return (value / 1000).toFixed(0) + 'k'
    }
    return value.toString()
  }

  _renderChart () {
    const canvas = el(`${this._elementQuery} canvas`)
    if (!canvas) return

    if (this._chart) {
      this._chart.destroy()
    }

    const data = this.logItems.map(l => l.balance)

    // Plugin to draw label on last point
    const lastPointLabelPlugin = {
      id: 'lastPointLabel',
      afterDatasetsDraw: (chart) => {
        const meta = chart.getDatasetMeta(0)
        if (!meta.data.length) return

        const lastPoint = meta.data[meta.data.length - 1]
        const lastValue = data[data.length - 1]
        const ctx = chart.ctx

        ctx.save()
        ctx.font = 'bold 12px sans-serif'
        ctx.textAlign = 'right'
        ctx.fillStyle = lastValue >= (data[data.length - 2] || 0) ? '#39ff14' : '#ff073a'

        const label = this._formatShort(lastValue) + '€'
        ctx.fillText(label, lastPoint.x - 8, lastPoint.y - 8)
        ctx.restore()
      }
    }

    this._chart = new Chart(canvas, {
      type: 'line',
      plugins: [lastPointLabelPlugin],
      data: {
        labels: this.logItems.map(l => `${l.game_day + 1}`),
        datasets: [{
          data: data,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.2,
          fill: true,
          backgroundColor: 'rgba(57, 255, 20, 0.1)',
          segment: {
            borderColor: (ctx) => {
              if (ctx.p0DataIndex === undefined) return '#39ff14'
              const prev = data[ctx.p0DataIndex]
              const curr = data[ctx.p1DataIndex]
              return curr >= prev ? '#39ff14' : '#ff073a'
            }
          },
          pointBackgroundColor: (ctx) => {
            if (ctx.dataIndex === 0) return '#39ff14'
            const prev = data[ctx.dataIndex - 1]
            const curr = data[ctx.dataIndex]
            return curr >= prev ? '#39ff14' : '#ff073a'
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 20
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleFont: { size: 11 },
            bodyFont: { size: 11 },
            padding: 8,
            callbacks: {
              title: (items) => `Game Day ${items[0].label}`,
              label: (context) => {
                const value = context.parsed.y
                const formatted = new Intl.NumberFormat('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0
                }).format(value)
                return formatted
              }
            }
          }
        },
        scales: {
          x: {
            display: false
          },
          y: {
            display: false,
            beginAtZero: false
          }
        }
      }
    })
  }
}
