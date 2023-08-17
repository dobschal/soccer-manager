import { el, generateId } from './html.js'

export function renderAsync (renderFn) {
  return (...params) => {
    const id = generateId()
    const updateFn = async (...params) => {
      const wrapperElement = el(id)
      if (!wrapperElement) return
      wrapperElement.innerHTML = await renderFn(...params, updateFn)
    }
    setTimeout(() => updateFn(...params))
    return `<div id="${id}" style="display: inline"></div>`
  }
}
