/**
 * @param {string} destination
 * @param {string} html
 * @returns {void}
 */
export function render (destination, html) {
  const parentElement = document.querySelector(destination)
  if (!parentElement) return console.error('Could not find element to render item into')
  parentElement.style.minHeight = parentElement.offsetHeight + 'px'
  parentElement.innerHTML = html
  setTimeout(() => {
    parentElement.style.minHeight = ''
  })
}
