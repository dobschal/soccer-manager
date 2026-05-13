import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchText } from '../../lib/fetchText.js'

/**
 * Minimal XHR mock to drive the fetchText helper.
 */
function installXhrMock (configure) {
  const instances = []
  class FakeXhr {
    constructor () {
      this.status = 0
      this.responseText = ''
      this.responseType = ''
      this.onload = null
      this.onerror = null
      instances.push(this)
    }
    open (method, url) {
      this.method = method
      this.url = url
    }
    send () {
      // Defer so the caller can attach handlers
      queueMicrotask(() => configure(this))
    }
  }
  const original = globalThis.XMLHttpRequest
  globalThis.XMLHttpRequest = FakeXhr
  return {
    instances,
    restore () {
      globalThis.XMLHttpRequest = original
    }
  }
}

describe('fetchText', () => {
  let mock

  afterEach(() => {
    mock?.restore()
  })

  it('resolves with the response body on 2xx', async () => {
    mock = installXhrMock((xhr) => {
      xhr.status = 200
      xhr.responseText = '<svg></svg>'
      xhr.onload()
    })
    await expect(fetchText('assets/manager.svg')).resolves.toBe('<svg></svg>')
    expect(mock.instances[0].url).toBe('assets/manager.svg')
    expect(mock.instances[0].method).toBe('GET')
  })

  it('treats status 0 as success (file:// URIs report 0 in Android WebView)', async () => {
    mock = installXhrMock((xhr) => {
      xhr.status = 0
      xhr.responseText = '<svg>local</svg>'
      xhr.onload()
    })
    await expect(fetchText('file:///android_asset/app/web/assets/manager.svg'))
      .resolves.toBe('<svg>local</svg>')
  })

  it('rejects on HTTP errors', async () => {
    mock = installXhrMock((xhr) => {
      xhr.status = 404
      xhr.onload()
    })
    await expect(fetchText('assets/missing.svg')).rejects.toThrow(/HTTP 404/)
  })

  it('rejects on network error', async () => {
    mock = installXhrMock((xhr) => {
      xhr.onerror()
    })
    await expect(fetchText('assets/manager.svg')).rejects.toThrow(/network error/)
  })
})

describe('managerChat.loadManagerChatSvg', () => {
  let mock
  beforeEach(() => {
    document.body.innerHTML = '<div id="mgr"></div>'
  })
  afterEach(() => {
    mock?.restore()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('renders SVG into the target element on success', async () => {
    mock = installXhrMock((xhr) => {
      xhr.status = 200
      xhr.responseText = '<svg><path fill="#ff0000"/></svg>'
      xhr.onload()
    })
    const { loadManagerChatSvg } = await import('../../partials/managerChat.js')
    await loadManagerChatSvg('mgr', '#3498db')
    const el = document.getElementById('mgr')
    expect(el.innerHTML).toContain('#3498db')
    expect(el.innerHTML).not.toContain('#ff0000')
  })

  it('does not throw when the asset fails to load (Android WebView file:// case)', async () => {
    mock = installXhrMock((xhr) => {
      xhr.onerror()
    })
    const { loadManagerChatSvg } = await import('../../partials/managerChat.js')
    await expect(loadManagerChatSvg('mgr', '#3498db')).resolves.toBeUndefined()
    expect(document.getElementById('mgr').innerHTML).toBe('')
  })
})
