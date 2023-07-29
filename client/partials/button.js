import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'

export function renderButton (text, _onClick, type = 'primary') {
  const id = generateId()

  onClick(id, _onClick)

  return `
    <button class="btn btn-${type}" type="button" id="${id}">${text}</button>
  `
}
