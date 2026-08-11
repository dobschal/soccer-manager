/**
 * Render a "prev / select / next" filter stepper as used by the league and cup
 * results filters.
 *
 * Layout (see `.results-filter` in `style/pages/results.css`):
 * - mobile: label, chevrons and select sit on a single line, never wrapping
 * - desktop (>= md): the label moves above, chevrons + select stay on one line
 *
 * @param {Object} options
 * @param {string} options.label - visible label text
 * @param {string} options.selectId - id of the <select> (also the label's `for`)
 * @param {string} options.prevId - id of the left chevron
 * @param {string} options.nextId - id of the right chevron
 * @param {string} options.optionsHtml - pre-rendered <option> markup
 * @param {string} [options.prevLabel] - aria-label for the left chevron
 * @param {string} [options.nextLabel] - aria-label for the right chevron
 * @returns {string}
 */
export function renderFilterStepper ({
  label,
  selectId,
  prevId,
  nextId,
  optionsHtml,
  prevLabel = '',
  nextLabel = ''
}) {
  return `
    <div class="results-filter d-flex align-items-center flex-nowrap gap-2 flex-md-column align-items-md-start gap-md-0">
      <label for="${selectId}" class="form-label results-filter-label mb-0 mb-md-1">${label}</label>
      <div class="d-flex align-items-center flex-nowrap gap-1">
        <span id="${prevId}" class="fa fa-chevron-left fa-button" role="button" aria-label="${prevLabel}"></span>
        <select id="${selectId}" class="form-select form-select-sm u-w-auto" aria-label="${label}">
          ${optionsHtml}
        </select>
        <span id="${nextId}" class="fa fa-chevron-right fa-button" role="button" aria-label="${nextLabel}"></span>
      </div>
    </div>
  `
}
