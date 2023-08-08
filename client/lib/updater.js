import { el, generateId } from './html.js'

export function updater (renderFn) {
  const id = generateId()
  const updateFn = async () => {
    const wrapperElement = el(id)
    wrapperElement.innerHTML = await renderFn(updateFn)
  }

  return () => {
    setTimeout(() => updateFn())
    return `<div id="${id}"></div>`
  }
}
