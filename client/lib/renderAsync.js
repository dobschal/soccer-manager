import { el, generateId } from './html.js'

export function renderAsync (renderFn) {
  return (...params) => {
    const id = generateId()
    const updateFn = async (...params) => {
      const wrapperElement = el(id)
      wrapperElement.innerHTML = await renderFn(updateFn, ...params)
    }
    setTimeout(() => updateFn(...params))
    return `<div id="${id}"></div>`
  }
}
