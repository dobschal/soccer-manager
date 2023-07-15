export function renderPage (html) {
  document.body.innerHTML = ''
  document.body.insertAdjacentHTML('afterbegin', html)
}
