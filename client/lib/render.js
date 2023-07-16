export function render (destination, html) {
  const parentElement = document.querySelector(destination)
  if (!parentElement) return console.error('Could not find element to render item into')
  parentElement.innerHTML = ''
  parentElement.insertAdjacentHTML('afterbegin', html)
}
