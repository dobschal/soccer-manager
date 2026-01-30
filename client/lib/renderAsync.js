import { el, generateId } from './html.js'

/**
 * @param {(...params: any[]) => Promise<string>} renderFn
 * @returns {(...params: any[]) => string}
 */
export function renderAsync (renderFn) {
  return (...params) => {
    const id = generateId()
    async function update () {
      /** @type {HTMLTemplateElement} */
      const wrapperElement = el(id)
      if (!wrapperElement) return
      wrapperElement.innerHTML = await renderFn(...params)
      wrapperElement.replaceWith(wrapperElement.content)
    }
    setTimeout(update)
    return `<template id="${id}"></template>`
  }
}
