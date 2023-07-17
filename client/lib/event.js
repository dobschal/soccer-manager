const _listeners = []

export function on (eventName, callback) {
  _listeners.push({ eventName, callback })
}
//
// TODO: add remove method
//

export function fire (eventName, data) {
  _listeners.forEach(listener => {
    if (listener.eventName === eventName) {
      listener.callback(data)
    }
  })
}
