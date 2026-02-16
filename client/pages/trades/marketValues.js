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
  for (let l = 100; l > level; l -= 10) price *= 0.5
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
  _fromLevel = 30
  _toLevel = 50
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
      },
      '#from-level-select': {
        change: (e) => {
          this._fromLevel = Number(e.target.value)
          if (this._fromLevel > this._toLevel) {
            this._toLevel = this._fromLevel
          }
          this.update()
        }
      },
      '#to-level-select': {
        change: (e) => {
          this._toLevel = Number(e.target.value)
          if (this._toLevel < this._fromLevel) {
            this._fromLevel = this._toLevel
          }
          this.update()
        }
      }
    }
  }

  get template () {
    const positions = Object.keys(Position)
    const ages = []
    for (let a = 16; a <= 35; a++) ages.push(a)
    const levels = []
    for (let l = this._toLevel; l >= this._fromLevel; l--) levels.push(l)

    const allLevels = []
    for (let l = 1; l <= 100; l++) allLevels.push(l)

    return `
      <div>
        <h2>${t('trades.marketValuesTitle')}</h2>
        <p>${t('trades.marketValuesDesc')}</p>
        <div class="d-flex flex-wrap gap-3 mb-3">
          <div>
            <label class="form-label" for="position-select">${t('trades.marketValuesPosition')}</label>
            <select class="form-select" id="position-select" style="max-width: 200px;">
              ${positions.map(pos => `<option value="${pos}" ${pos === this._selectedPosition ? 'selected' : ''}>${t('actionCards.position.' + pos)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label" for="from-level-select">${t('trades.marketValuesFromLevel')}</label>
            <select class="form-select" id="from-level-select" style="max-width: 200px;">
              ${allLevels.map(l => `<option value="${l}" ${l === this._fromLevel ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label" for="to-level-select">${t('trades.marketValuesToLevel')}</label>
            <select class="form-select" id="to-level-select" style="max-width: 200px;">
              ${allLevels.map(l => `<option value="${l}" ${l === this._toLevel ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="overflow-x: auto; margin: 0 -2rem">
          <table class="table table-sm table-bordered" style="margin: 0">
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
