/**
 * Render pagination page number <li> items.
 * Shows at most 5 pages: first 2, current, last 2 — with ellipsis gaps.
 * @param {number} totalPages
 * @param {number} currentPage - 0-indexed
 * @returns {string}
 */
export function renderPageNumbers (totalPages, currentPage) {
  if (totalPages <= 5) {
    return _renderPages(Array.from({ length: totalPages }, (_, i) => i), currentPage)
  }

  const pages = new Set()
  // Always show first two and last two
  pages.add(0)
  pages.add(totalPages - 1)
  pages.add(currentPage)
  pages.add(Math.min(totalPages - 1, currentPage + 1))
  pages.add(Math.max(0, currentPage - 1))

  const sorted = [...pages].sort((a, b) => a - b)

  let html = ''
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      html += '<li class="page-item disabled"><span class="page-link">&hellip;</span></li>'
    }
    const isActive = sorted[i] === currentPage
    html += `
      <li class="page-item ${isActive ? 'active' : ''}">
        <span class="page-link u-cursor-pointer" data-page-index="${sorted[i]}">${sorted[i] + 1}</span>
      </li>`
  }
  return html
}

/**
 * @param {number[]} pages
 * @param {number} currentPage
 * @returns {string}
 */
function _renderPages (pages, currentPage) {
  return pages.map(i => {
    const isActive = i === currentPage
    return `
      <li class="page-item ${isActive ? 'active' : ''}">
        <span class="page-link u-cursor-pointer" data-page-index="${i}">${i + 1}</span>
      </li>`
  }).join('')
}
