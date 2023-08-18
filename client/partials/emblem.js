/**
 * @param {TeamType} team
 * @param {number} [size]
 * @param {boolean} [withText]
 * @returns {Promise<string>}
 */
export async function renderEmblem (team, size = 200, withText = true) {
  const imageUrl = 'assets/emblem.svg'
  const rawResponse = await fetch(imageUrl)
  let svg = await rawResponse.text()
  svg = svg.replace('width="500"', `width="${size}"`)
  svg = svg.replace('height="500"', `height="${size}"`)
  svg = svg.replaceAll('#FF0000', team.color)
  const nameSplitted = team.name.split(' ')
  const name = withText ? nameSplitted[nameSplitted.length - 1] : ''
  return `
    <div class="emblem" style="width: ${size}px">
        ${svg}
        <h2 style="font-size: ${Math.floor(size / 9)}px">${name}</h2>
    </div>
  `
}
