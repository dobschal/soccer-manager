import { describe, it, expect } from 'vitest'

import { ProgressBar } from '../../partials/progressBar.js'

describe('ProgressBar', () => {
  describe('template rendering', () => {
    it('renders percentage correctly', () => {
      const bar = new ProgressBar(0.75)

      const html = bar.template
      expect(html).toContain('75%')
      expect(html).toContain('aria-valuenow="75"')
    })

    it('rounds percentage to nearest integer', () => {
      const bar = new ProgressBar(0.756)

      const html = bar.template
      expect(html).toContain('76%')
    })

    it('handles zero value', () => {
      const bar = new ProgressBar(0)

      const html = bar.template
      expect(html).toContain('0%')
      expect(html).toContain('width: 0%')
    })

    it('handles full value', () => {
      const bar = new ProgressBar(1)

      const html = bar.template
      expect(html).toContain('100%')
      expect(html).toContain('width: 100%')
    })
  })

  describe('color classes', () => {
    it('shows success (green) for 80% and above', () => {
      const bar = new ProgressBar(0.85)

      const html = bar.template
      expect(html).toContain('bg-success')
      expect(html).toContain('#198754') // Success text color
    })

    it('shows success for exactly 80%', () => {
      const bar = new ProgressBar(0.80)

      const html = bar.template
      expect(html).toContain('bg-success')
    })

    it('shows warning (darker yellow) for 60-79%', () => {
      const bar = new ProgressBar(0.70)

      const html = bar.template
      expect(html).toContain('bg-warning')
      expect(html).toContain('#cc9a06') // Warning text color
    })

    it('shows warning for exactly 60%', () => {
      const bar = new ProgressBar(0.60)

      const html = bar.template
      expect(html).toContain('bg-warning')
    })

    it('shows orange for 40-59%', () => {
      const bar = new ProgressBar(0.50)

      const html = bar.template
      expect(html).toContain('background-color: #fd7e14')
      expect(html).toContain('#fd7e14') // Orange text color
    })

    it('shows orange for exactly 40%', () => {
      const bar = new ProgressBar(0.40)

      const html = bar.template
      expect(html).toContain('background-color: #fd7e14')
    })

    it('shows danger (red) for below 40%', () => {
      const bar = new ProgressBar(0.30)

      const html = bar.template
      expect(html).toContain('bg-danger')
      expect(html).toContain('#dc3545') // Danger text color
    })

    it('shows danger for 0%', () => {
      const bar = new ProgressBar(0)

      const html = bar.template
      expect(html).toContain('bg-danger')
    })
  })

  describe('responsive design', () => {
    it('has progress bar for large screens', () => {
      const bar = new ProgressBar(0.5)

      const html = bar.template
      expect(html).toContain('d-none d-lg-flex')
      expect(html).toContain('progress')
    })

    it('has text-only display for small screens', () => {
      const bar = new ProgressBar(0.5)

      const html = bar.template
      expect(html).toContain('d-lg-none')
      expect(html).toContain('fw-bold')
    })
  })

  describe('accessibility', () => {
    it('includes aria attributes', () => {
      const bar = new ProgressBar(0.65)

      const html = bar.template
      expect(html).toContain('role="progressbar"')
      expect(html).toContain('aria-valuenow="65"')
      expect(html).toContain('aria-valuemin="0"')
      expect(html).toContain('aria-valuemax="100"')
    })
  })

  describe('edge cases', () => {
    it('handles values slightly above thresholds', () => {
      const bar = new ProgressBar(0.81)

      const html = bar.template
      expect(html).toContain('bg-success')
    })

    it('handles values slightly below thresholds', () => {
      const bar = new ProgressBar(0.79)

      const html = bar.template
      expect(html).toContain('bg-warning')
    })

    it('handles very small values', () => {
      const bar = new ProgressBar(0.01)

      const html = bar.template
      expect(html).toContain('1%')
    })
  })
})
