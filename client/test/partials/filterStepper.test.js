import { describe, expect, it } from 'vitest'
import { renderFilterStepper } from '../../partials/filterStepper.js'

function render (overrides = {}) {
  return renderFilterStepper({
    label: 'Saison',
    selectId: 'my-select',
    prevId: 'my-prev',
    nextId: 'my-next',
    optionsHtml: '<option value="1" selected>2</option>',
    prevLabel: 'Zurück',
    nextLabel: 'Weiter',
    ...overrides
  })
}

describe('renderFilterStepper', () => {
  it('renders label, both chevrons and the select with the given ids', () => {
    const html = render()
    expect(html).toContain('for="my-select"')
    expect(html).toContain('>Saison</label>')
    expect(html).toContain('id="my-prev"')
    expect(html).toContain('id="my-next"')
    expect(html).toContain('id="my-select"')
    expect(html).toContain('<option value="1" selected>2</option>')
  })

  it('keeps label, chevrons and select on one line and only stacks from md up', () => {
    const html = render()
    // Mobile: single flex row containing the label -> no wrap.
    expect(html).toContain('results-filter d-flex align-items-center flex-nowrap')
    // Desktop: label moves above the chevrons + select row.
    expect(html).toContain('flex-md-column')
    expect(html).toContain('align-items-md-start')
    // The chevrons + select row itself never wraps either.
    expect(html).toContain('<div class="d-flex align-items-center flex-nowrap gap-1">')
  })

  it('exposes accessible labels on the chevrons and the select', () => {
    const html = render()
    expect(html).toContain('aria-label="Zurück"')
    expect(html).toContain('aria-label="Weiter"')
    expect(html).toContain('aria-label="Saison"')
  })
})
