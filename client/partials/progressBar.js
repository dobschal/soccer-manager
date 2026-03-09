import { UIElement } from '../lib/UIElement.js'

/**
 * Get color class based on value
 * @param {number} percentage - Value between 0 and 100
 * @returns {string} - Color class name
 */
function getColorClass (percentage) {
  if (percentage >= 80) return 'success' // green
  if (percentage >= 60) return 'warning' // darker yellow
  if (percentage >= 40) return 'orange' // orange (custom)
  return 'danger' // red
}


export class ProgressBar extends UIElement {
  /**
   * @param {number} value - Value between 0 and 1
   */
  constructor (value) {
    super()
    this.value = value
  }

  /**
   * @returns {string}
   */
  get template () {
    const percentage = Math.round(this.value * 100)
    const colorClass = getColorClass(percentage)
    // Custom orange color for Bootstrap (not built-in)
    const bgClass = colorClass === 'orange' ? '' : `bg-${colorClass}`
    const bgStyle = colorClass === 'orange' ? 'background-color: #fd7e14;' : ''

    return `
      <div>
        <div class="progress" style="height: 22px; min-width: 60px;">
          <div
            class="progress-bar ${bgClass}"
            role="progressbar"
            style="width: ${percentage}%; ${bgStyle}"
            aria-valuenow="${percentage}"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            ${percentage}%
          </div>
        </div>
      </div>
    `
  }
}
