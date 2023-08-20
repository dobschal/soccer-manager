/**
 * @param {HTMLElement|Node} obj
 * @param {(addedNodes: (HTMLElement|Node)[], removedNodes: (HTMLElement|Node)[], mutations: MutationRecord[]) => void} callback
 * @returns {MutationObserver}
 */
export function onDOMNodeChanged (obj, callback) {
  const mutationObserver = new MutationObserver(function (m) {
    const addedNodes = []; const removedNodes = []
    m.forEach(record => record.addedNodes.length & addedNodes.push(...record.addedNodes))
    m.forEach(record => record.removedNodes.length & removedNodes.push(...record.removedNodes))
    callback(addedNodes, removedNodes, m)
  })

  mutationObserver.observe(obj, { childList: true, subtree: true })

  return mutationObserver
}
