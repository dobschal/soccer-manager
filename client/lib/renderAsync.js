import { el, generateId } from './html.js'

export function renderAsync (renderFn) {
  return (...params) => {
    const id = generateId()
    async function update () {
      const wrapperElement = el(id)
      if (!wrapperElement) return
      wrapperElement.innerHTML = await renderFn(...params)
      wrapperElement.replaceWith(...wrapperElement.childNodes)
    }
    setTimeout(update)
    return `<div id="${id}" style="display: inline"></div>`
  }
}
