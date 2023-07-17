export function onChange (elementQuery, handler) {
  on('change', elementQuery, handler)
}

export function onClick (elementQuery, handler) {
  on('click', elementQuery, handler)
}

/**
 * Attach a submit event listener to a HTML element in the DOM by a query.
 *
 * @param {string} elementQuery - '#login-form'
 * @param {(event: SubmitEvent) => void} handler
 */
export function onSubmit (elementQuery, handler) {
  on('submit', elementQuery, handler)
}

export function on (eventName, elementQuery, handler) {
  setTimeout(() => {
    const element = document.querySelector(elementQuery)
    if (!element) return console.error('No element for event handler', elementQuery)
    element.addEventListener(eventName, handler)
  })
}
