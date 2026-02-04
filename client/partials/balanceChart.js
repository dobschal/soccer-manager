import { Chart } from 'chart.js/auto'
import { UIElement } from '../lib/UIElement.js'
import { el } from '../lib/html.js'
import { deepCopy } from '../lib/deepCopy.js'

export class BalanceChart extends UIElement {
  /** @type {FinanceLogEntry[]} */
  logItems = []
  _resizeHandler = null
  _chart = null

  /**
   * @param {FinanceLogEntry[]} [financeLog]
   */
  constructor (financeLog = []) {
    super()
    this._processLogItems(financeLog)
  }

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
   * @returns {string}
   */
  get template () {
    return `<div style="position: relative; height: 350px; width: 100%; background: rgb(239,239,239); padding: 16px; border-radius: 8px; box-sizing: border-box;"><canvas class="finance-canvas"></canvas></div>`
  }

  /**
   * @returns {void}
   */
  onMounted () {
    this._resizeHandler = this._renderChart.bind(this)
    window.addEventListener('resize', this._resizeHandler)
    this._renderChart()
  }

  /**
   * @returns {void}
   */
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

  /**
   * Calculate percentage changes between data points
   * @returns {Array<string|null>}
   */
  _calculatePercentageChanges () {
    return this.logItems.map((item, index) => {
      if (index === 0) return null
      const prev = this.logItems[index - 1].balance
      if (prev === 0) return null
      const change = ((item.balance - prev) / prev) * 100
      return change >= 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`
    })
  }

  /**
   * @returns {void}
   */
  _renderChart () {
    const canvas = el(`${this._elementQuery} canvas`)
    if (!canvas) return

    if (this._chart) {
      this._chart.destroy()
    }

    const ctx = canvas.getContext('2d')
    const data = this.logItems.map(l => l.balance)
    const percentageChanges = this._calculatePercentageChanges()

    // Create gradients for green and red
    const greenGradient = ctx.createLinearGradient(0, 0, 0, 300)
    greenGradient.addColorStop(0, 'rgba(34, 197, 94, 0.8)')
    greenGradient.addColorStop(1, 'rgba(34, 197, 94, 0.2)')

    const redGradient = ctx.createLinearGradient(0, 0, 0, 300)
    redGradient.addColorStop(0, 'rgba(239, 68, 68, 0.8)')
    redGradient.addColorStop(1, 'rgba(239, 68, 68, 0.2)')

    // Plugin to draw percentage labels
    const percentagePlugin = {
      id: 'percentageLabels',
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx
        const meta = chart.getDatasetMeta(0)

        ctx.save()
        ctx.font = 'bold 11px sans-serif'
        ctx.textAlign = 'center'

        meta.data.forEach((point, index) => {
          if (index === 0 || !percentageChanges[index]) return

          const change = percentageChanges[index]
          const isPositive = change.startsWith('+')

          ctx.fillStyle = isPositive ? '#16a34a' : '#dc2626'

          // Position label above/below the point
          const yOffset = isPositive ? -12 : 16
          ctx.fillText(change, point.x, point.y + yOffset)
        })
        ctx.restore()
      }
    }

    this._chart = new Chart(canvas, {
      type: 'line',
      plugins: [percentagePlugin],
      data: {
        labels: this.logItems.map(l => `Gameday ${l.game_day + 1}`),
        datasets: [{
          label: 'Balance €',
          data: data,
          borderWidth: 4,
          pointRadius: 0,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true,
          segment: {
            borderColor: (ctx) => {
              if (ctx.p0DataIndex === undefined) return '#22c55e'
              const prev = data[ctx.p0DataIndex]
              const curr = data[ctx.p1DataIndex]
              return curr >= prev ? '#22c55e' : '#ef4444'
            },
            backgroundColor: (ctx) => {
              if (ctx.p0DataIndex === undefined) return greenGradient
              const prev = data[ctx.p0DataIndex]
              const curr = data[ctx.p1DataIndex]
              return curr >= prev ? greenGradient : redGradient
            }
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
            titleFont: {
              size: 14,
              weight: 'bold'
            },
            bodyFont: { size: 13 },
            padding: 12,
            callbacks: {
              label: (context) => {
                const value = context.parsed.y
                const formatted = new Intl.NumberFormat('de-DE', {
                  style: 'currency',
                  currency: 'EUR'
                }).format(value)
                return `Balance: ${formatted}`
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            border: {
              display: true,
              color: '#1f2937',
              width: 2
            },
            ticks: {
              color: '#1f2937',
              font: {
                size: 12,
                weight: 'bold'
              }
            }
          },
          y: {
            beginAtZero: false,
            grid: {
              display: false
            },
            border: {
              display: true,
              color: '#1f2937',
              width: 2
            },
            ticks: {
              color: '#1f2937',
              font: {
                size: 12,
                weight: 'bold'
              },
              callback: (value) => {
                return new Intl.NumberFormat('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                  notation: 'compact'
                }).format(value)
              }
            }
          }
        }
      }
    })
  }
}
