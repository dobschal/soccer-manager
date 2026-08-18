/**
 * Collapsible Bootstrap cards.
 *
 * The game details overlay stacks several long cards (match report, event
 * ticker, both squad lists, stadium). Rendering them all expanded makes the
 * overlay a very long scroll, so they start folded and the header acts as the
 * toggle.
 *
 * Folding is a pure DOM class flip — no re-render — so an open card never
 * loses its scroll position and nested UIElements are not recreated.
 */

/**
 * @param {Object} params
 * @param {string} params.title - Header text (already translated)
 * @param {string} [params.icon] - Font Awesome class, e.g. `fa-clock-o`
 * @param {string} params.body - Inner HTML of the card body
 * @param {boolean} [params.collapsed] - Initial state, collapsed by default
 * @param {string} [params.cardClass] - Extra classes for the card element
 * @param {string} [params.bodyClass] - Classes for the body wrapper
 * @returns {string}
 */
export function renderCollapsibleCard ({
  title,
  icon = '',
  body,
  collapsed = true,
  cardClass = 'mb-3',
  bodyClass = 'card-body'
}) {
  return `
    <div class="card collapsible-card ${collapsed ? 'is-collapsed' : ''} ${cardClass}">
      <button type="button" class="card-header collapsible-card-toggle" aria-expanded="${!collapsed}">
        <span>${icon ? `<i class="fa ${icon} me-2"></i>` : ''}${title}</span>
        <i class="fa fa-chevron-down collapsible-card-chevron"></i>
      </button>
      <div class="collapsible-card-content ${bodyClass}">${body}</div>
    </div>
  `
}

/**
 * Click handler for `.collapsible-card-toggle`. Register it on the UIElement
 * that owns the card(s).
 *
 * @param {Event} event
 * @returns {boolean|null} the new collapsed state, or null when the click did
 *   not land on a collapsible card
 */
export function toggleCollapsibleCard (event) {
  const toggle = event.target?.closest?.('.collapsible-card-toggle')
  const card = toggle?.closest('.collapsible-card')
  if (!card) return null
  const isCollapsed = card.classList.toggle('is-collapsed')
  toggle.setAttribute('aria-expanded', String(!isCollapsed))
  return isCollapsed
}
