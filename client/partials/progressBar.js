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

/**
 * Synchronous progress bar HTML. Exported so callers rendering the bar inside
 * their own template (e.g. a table row) can inline the markup directly instead
 * of routing through a UIElement, which would surface as a `<template>`
 * placeholder for one frame after every parent re-render.
 * @param {number} value - Value between 0 and 1
 * @returns {string}
 */
export function renderProgressBar (value) {
  const percentage = Math.round(value * 100)
  const colorClass = getColorClass(percentage)
  // Custom orange color for Bootstrap (not built-in)
  const bgClass = colorClass === 'orange' ? '' : `bg-${colorClass}`
  const bgStyle = colorClass === 'orange' ? 'background-color: #fd7e14;' : ''

  return `
    <div>
      <div class="progress progress--custom">
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
    return renderProgressBar(this.value)
  }
}
