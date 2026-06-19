/* eslint-disable no-undef */
// Electron main process for the FootballManager.IO desktop app.
//
// Like the iOS/Android apps, the web client is bundled *inside* the app (the
// same `native-client.zip` the mobile builds ship) and loaded from local disk
// via a custom `app://` scheme. A background check downloads newer bundles from
// the server and applies them on the next launch (see ota.cjs). The web app
// itself still talks to the production (or sandbox) server for the API and
// websocket, exactly like the mobile clients — only the static assets are local.
//
// A custom scheme (rather than file://) is required because the client uses ES
// modules, which Chromium refuses to load over file:// for CORS reasons.

const { app, BrowserWindow, shell, Menu, protocol } = require('electron')
const fs = require('fs')
const path = require('path')
const ota = require('./ota.cjs')

const isMac = process.platform === 'darwin'
const SCHEME = 'app'
const APP_ORIGIN = `${SCHEME}://bundle`
const START_URL = `${APP_ORIGIN}/index.html`

// Directory the protocol handler serves from. Set once at startup, after any
// staged OTA update has been promoted.
let webDir = null

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4'
}

// The bundled index.html hardcodes the production server URL with a `||`
// fallback. For the sandbox build we swap it so API/websocket point at sandbox.
function applyServerUrl (html) {
  const serverUrl = ota.getServerUrl()
  if (serverUrl === ota.PRODUCTION_URL) return html
  return html.replace(`|| '${ota.PRODUCTION_URL}'`, `|| '${serverUrl}'`)
}

function registerAppProtocol () {
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url)
    let relative = decodeURIComponent(pathname)
    if (relative === '/' || relative === '') relative = '/index.html'

    // Resolve inside webDir and reject path traversal.
    const filePath = path.join(webDir, path.normalize(relative))
    if (filePath !== webDir && !filePath.startsWith(webDir + path.sep)) {
      return new Response('Forbidden', { status: 403 })
    }

    try {
      const ext = path.extname(filePath).toLowerCase()
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'
      if (ext === '.html') {
        const html = applyServerUrl(await fs.promises.readFile(filePath, 'utf-8'))
        return new Response(html, { headers: { 'content-type': contentType } })
      }
      const data = await fs.promises.readFile(filePath)
      return new Response(data, { headers: { 'content-type': contentType } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function createWindow () {
  const iconPath = path.join(__dirname, 'assets', 'icon.png')
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'FootballManager.IO',
    backgroundColor: '#0d1f2d',
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.loadURL(START_URL)

  // Internal navigation stays in the window; everything else opens in the OS
  // browser (forum mention links, mailto:, the live server URL, …).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_ORIGIN)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function buildMenu () {
  const template = []
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }
  template.push(
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ role: 'front' }] : [{ role: 'close' }])
      ]
    }
  )
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// The custom scheme must be registered as privileged before the app is ready
// so ES modules, fetch() and secure-context features behave like https.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true }
  }
])

app.whenReady().then(() => {
  // 1. Make sure the bundled web app is on disk, 2. promote any update staged
  // on a previous run, 3. decide which directory to serve.
  ota.ensureBundledExtracted()
  ota.promoteStagingIfReady()
  webDir = ota.getWebContentPath()
  console.log('[desktop] Serving web content from:', webDir)

  registerAppProtocol()
  buildMenu()
  createWindow()

  // Background: fetch a newer bundle for next launch. Never blocks the UI.
  ota.checkForUpdate().then((result) => {
    if (result.staged) {
      console.log(`[desktop] Update v${result.version} staged — will apply on next restart.`)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
