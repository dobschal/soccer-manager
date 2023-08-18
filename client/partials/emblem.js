import { UIElement } from '../lib/UIElement.js'

/**
 *
 */
export class Emblem extends UIElement {
  size = 200
  withText = true

  get template () {
    return `
      <div class="emblem" style="width: ${this.size}px">
          ${this.svg}
          <h2 style="font-size: ${Math.floor(this.size / 9)}px">${this.name}</h2>
      </div>
    `
  }

  async load () {
    const imageUrl = 'assets/emblem.svg'
    const rawResponse = await fetch(imageUrl)
    let svg = await rawResponse.text()
    svg = svg.replace('width="500"', `width="${this.size}"`)
    svg = svg.replace('height="500"', `height="${this.size}"`)
    this.svg = svg.replaceAll('#FF0000', this.team.color)
    const nameSplitted = this.team.name.split(' ')
    this.name = this.withText ? nameSplitted[nameSplitted.length - 1] : ''
  }
}
