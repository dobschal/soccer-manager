/**
 * Fetch a text resource by URL.
 *
 * In the Android WebView (NativeScript native app) the Fetch API refuses
 * file:// URLs ("URL scheme 'file' is not supported."), but XMLHttpRequest
 * works for both file:// and http(s)://. This helper uses XHR so calls work
 * uniformly in the browser and in the Android WebView when the page is
 * loaded from file:///android_asset/.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
export function fetchText (url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.responseType = 'text'
    xhr.onload = () => {
      // XHR on file:// reports status 0 even on success
      const ok = xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)
      if (!ok) {
        reject(new Error(`fetchText failed for ${url}: HTTP ${xhr.status}`))
        return
      }
      resolve(xhr.responseText)
    }
    xhr.onerror = () => reject(new Error(`fetchText network error for ${url}`))
    xhr.send()
  })
}
