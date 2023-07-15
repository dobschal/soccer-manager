export function onClick (elementQuery, handler) {
  setTimeout(() => {
    const element = document.querySelector(elementQuery)
    if (!element) return console.error('No element for event handler', elementQuery)
    element.addEventListener('click', handler)
  })
}
