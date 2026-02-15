import { UIElement } from '../../lib/UIElement.js'
import { euroFormat } from '../../lib/currency.js'
import { Position } from '../../util/formation.js'
import { t } from '../../i18n/index.js'
import { server } from '../../lib/gateway.js'

/**
 * @param {number} level
 * @param {number} age
 * @returns {number}
 */
export function calculateMarketValue (level, age) {
  let price = 50_000_000
  for (let a = 22; a < age; a++) price *= 0.75
  for (let l = 10; l > level; l--) price *= 0.5
  return Math.floor(price)
}

/**
 * @param {number} avgPrice
 * @param {number} estimate
 * @returns {string}
 */
export function getCellColor (avgPrice, estimate) {
  if (avgPrice < estimate * 0.8) return 'background: #d1e7dd'
  if (avgPrice > estimate * 1.2) return 'background: #f8d7da'
  return 'background: #fff3cd'
}

export class MarketValuesPage extends UIElement {
  _selectedPosition = 'CM'
  _transferStats = {}

  async load () {
    this._transferStats = await server.getTransferStats(this._selectedPosition)
  }

  get events () {
    return {
      '#position-select': {
        change: (e) => {
          this._selectedPosition = e.target.value
          this.update(true)
        }
      }
    }
  }

  get template () {
    const positions = Object.keys(Position)
    const ages = []
    for (let a = 16; a <= 35; a++) ages.push(a)
    const levels = []
    for (let l = 10; l >= 1; l--) levels.push(l)

    return `
      <div>
        <h2>${t('trades.marketValuesTitle')}</h2>
        <p>${t('trades.marketValuesDesc')}</p>
        <div class="mb-3">
          <label class="form-label" for="position-select">${t('trades.marketValuesPosition')}</label>
          <select class="form-select" id="position-select" style="max-width: 300px;">
            ${positions.map(pos => `<option value="${pos}" ${pos === this._selectedPosition ? 'selected' : ''}>${t('actionCards.position.' + pos)}</option>`).join('')}
          </select>
        </div>
        <div style="overflow-x: auto;">
          <table class="table table-sm table-bordered">
            <thead>
              <tr>
                <th>${t('trades.marketValuesLevel')}</th>
                ${ages.map(a => `<th class="text-center">${a}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${levels.map(level => `
                <tr>
                  <td><strong>${level}</strong></td>
                  ${ages.map(age => {
                    const key = `${level}:${age}`
                    const stat = this._transferStats[key]
                    const estimate = calculateMarketValue(level, age)
                    const style = stat ? getCellColor(stat.avgPrice, estimate) : 'background: #f0f0f0'
                    const displayValue = stat ? stat.avgPrice : estimate
                    return `<td class="text-end text-nowrap" style="${style}">${euroFormat.format(displayValue)}</td>`
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `
  }
}
