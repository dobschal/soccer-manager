export function onChange (elementQuery, handler) {
  return on('change', elementQuery, handler)
}

export function onClick (elementQuery, handler) {
  return on('click', elementQuery, handler)
}

/**
 * Attach a submit event listener to a HTML element in the DOM by a query.
 *
 * @param {string} elementQuery - '#login-form'
 * @param {(event: SubmitEvent) => void} handler
 */
export function onSubmit (elementQuery, handler) {
  return on('submit', elementQuery, handler)
}

export function on (eventName, elementQuery, handler) {
  setTimeout(() => {
    if (elementQuery.startsWith('_')) elementQuery = '#' + elementQuery
    const element = document.querySelector(elementQuery)
    if (!element) return console.error('No element for event handler', elementQuery, eventName, handler)
    element.addEventListener(eventName, handler)
  })
}
