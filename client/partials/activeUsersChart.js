import { Chart } from 'chart.js/auto'
import { UIElement } from '../lib/UIElement.js'
import { el } from '../lib/html.js'
import { t } from '../i18n/index.js'

/**
 * Renders DAU/WAU/MAU as three line series over time. Rows are expected
 * in newest-first order (matching getStatistics) and are reversed for
 * left-to-right chronological display.
 */
export class ActiveUsersChart extends UIElement {
  /**
   * @param {Array<{ created_at: string, daily_active_users: number, weekly_active_users: number, monthly_active_users: number }>} statistics
   */
  constructor (statistics = []) {
    super()
    this._statistics = [...statistics].reverse()
  }

  get template () {
    return `<div class="card card-body bg-dark mb-4 active-users-chart-container"><canvas class="active-users-canvas"></canvas></div>`
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

  _statistics = []
  _resizeHandler = null
  _chart = null

  _renderChart () {
    const canvas = el(`${this._elementQuery} canvas`)
    if (!canvas) return

    if (this._chart) {
      this._chart.destroy()
    }

    const labels = this._statistics.map(s => new Date(s.created_at).toLocaleDateString())
    const dau = this._statistics.map(s => Number(s.daily_active_users) || 0)
    const wau = this._statistics.map(s => Number(s.weekly_active_users) || 0)
    const mau = this._statistics.map(s => Number(s.monthly_active_users) || 0)

    this._chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: t('admin.statisticsDailyActiveUsers'),
            data: dau,
            borderColor: '#39ff14',
            backgroundColor: 'rgba(57, 255, 20, 0.1)',
            borderWidth: 3,
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0.2,
            fill: false
          },
          {
            label: t('admin.statisticsWeeklyActiveUsers'),
            data: wau,
            borderColor: '#ffd60a',
            backgroundColor: 'rgba(255, 214, 10, 0.1)',
            borderWidth: 3,
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0.2,
            fill: false
          },
          {
            label: t('admin.statisticsMonthlyActiveUsers'),
            data: mau,
            borderColor: '#4cc9f0',
            backgroundColor: 'rgba(76, 201, 240, 0.1)',
            borderWidth: 3,
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0.2,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: 'rgba(255, 255, 255, 0.9)',
              font: { size: 12 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            padding: 10
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)',
              font: { size: 11 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 10
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)',
              font: { size: 11 },
              precision: 0
            }
          }
        }
      }
    })
  }
}
