const _listeners = []
let eventIdCounter = 0

/**
 * @param {string} eventName
 * @param {() => void} callback
 * @returns {number}
 */
export function on (eventName, callback) {
  const id = eventIdCounter++
  _listeners.push({ eventName, callback, id })
  return id
}

export function off (id) {
  const index = _listeners.findIndex(l => l.id === id)
  if (index === -1) return console.error('Cannot remove event listener.', id)
  console.log('Removed event listener', id)
  _listeners.splice(index, 1)
}

export function fire (eventName, data) {
  _listeners.forEach(listener => {
    if (listener.eventName === eventName) {
      listener.callback(data)
    }
  })
}
