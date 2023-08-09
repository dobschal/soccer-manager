import { el, generateId } from './html.js'

export function updater (renderFn) {
  const id = generateId()
  const updateFn = async (...params) => {
    const wrapperElement = el(id)
    wrapperElement.innerHTML = await renderFn(updateFn, ...params)
  }

  return (...params) => {
    setTimeout(() => updateFn(...params))
    return `<div id="${id}"></div>`
  }
}
