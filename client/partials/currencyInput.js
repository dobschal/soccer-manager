/**
 * Renders an HTML string for a currency input with €-suffix.
 * @param {string} id - The element ID for the input
 * @param {string} placeholder - Placeholder text
 * @returns {string}
 */
export function renderCurrencyInput (id, placeholder) {
  return `
    <div class="input-group">
      <input type="text" inputmode="numeric" id="${id}" class="form-control" placeholder="${placeholder}" data-raw-value="0">
      <div class="input-group-append">
        <span class="input-group-text">,00 €</span>
      </div>
    </div>
  `
}

/**
 * Attaches formatting logic to a currency input after DOM insertion.
 * Strips non-digits, formats with thousand separators, and stores raw value.
 * @param {string} id - The element ID for the input
 */
export function setupCurrencyInput (id) {
  setTimeout(() => {
    const input = document.getElementById(id)
    if (!input) return
    input.addEventListener('input', () => {
      const raw = input.value.replace(/\D/g, '')
      const num = parseInt(raw, 10) || 0
      input.dataset.rawValue = String(num)
      input.value = num === 0 ? '' : num.toLocaleString('de-DE')
    })
  }, 0)
}
