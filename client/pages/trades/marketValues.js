import { UIElement } from '../../lib/UIElement.js'
import { euroFormat } from '../../lib/currency.js'
import { Position } from '../../util/formation.js'
import { t } from '../../i18n/index.js'
import { server } from '../../lib/gateway.js'
import { calculateMarketValue } from '../../util/player.js'
export { calculateMarketValue }

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
  async load () {
    this._transferStats = await server.getTransferStats(this._selectedPosition)
  }
  get template () {
    const positions = Object.keys(Position)
    const ages = []
    for (let a = this._fromAge; a <= this._toAge; a++) ages.push(a)
    const levels = []
    for (let l = this._toLevel; l >= this._fromLevel; l--) levels.push(l)

    const allLevels = []
    for (let l = 1; l <= 100; l++) allLevels.push(l)

    const allAges = []
    for (let a = 16; a <= 35; a++) allAges.push(a)

    return `
      <div>
        <h2>${t('trades.marketValuesTitle')}</h2>
        <p>${t('trades.marketValuesDesc')}</p>
        <div class="d-flex flex-wrap gap-3 mb-3">
          <div>
            <label class="form-label" for="position-select">${t('trades.marketValuesPosition')}</label>
            <select class="form-select" id="position-select" class="u-max-w-200">
              ${positions.map(pos => `<option value="${pos}" ${pos === this._selectedPosition ? 'selected' : ''}>${t('actionCards.position.' + pos)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label" for="from-level-select">${t('trades.marketValuesFromLevel')}</label>
            <select class="form-select" id="from-level-select" class="u-max-w-200">
              ${allLevels.map(l => `<option value="${l}" ${l === this._fromLevel ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label" for="to-level-select">${t('trades.marketValuesToLevel')}</label>
            <select class="form-select" id="to-level-select" class="u-max-w-200">
              ${allLevels.map(l => `<option value="${l}" ${l === this._toLevel ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label" for="from-age-select">${t('trades.marketValuesFromAge')}</label>
            <select class="form-select" id="from-age-select" class="u-max-w-200">
              ${allAges.map(a => `<option value="${a}" ${a === this._fromAge ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label" for="to-age-select">${t('trades.marketValuesToAge')}</label>
            <select class="form-select" id="to-age-select" class="u-max-w-200">
              ${allAges.map(a => `<option value="${a}" ${a === this._toAge ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="horizontal-scrollable-table">
          <table class="table wide-on-mobile">
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
    const style = stat ? '' : 'color: #c0c0c0;'
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
      },
      '#from-age-select': {
        change: (e) => {
          this._fromAge = Number(e.target.value)
          if (this._fromAge > this._toAge) {
            this._toAge = this._fromAge
          }
          this.update()
        }
      },
      '#to-age-select': {
        change: (e) => {
          this._toAge = Number(e.target.value)
          if (this._toAge < this._fromAge) {
            this._fromAge = this._toAge
          }
          this.update()
        }
      }
    }
  }
  _selectedPosition = 'CM'
  _fromLevel = 40
  _toLevel = 50
  _fromAge = 20
  _toAge = 30
  _transferStats = {}
  
}
