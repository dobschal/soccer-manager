/* eslint-disable no-undef */
// Electron main process for the FootballManager.IO desktop app.
//
// The desktop app is intentionally a thin shell: it points an Electron
// BrowserWindow at the production (or sandbox) web build, so the user gets
// the exact same UX as the browser version — including the desktop navigation
// (no native tab bar). Everything important lives in the web app already.

const { app, BrowserWindow, shell, Menu } = require('electron')
const path = require('path')

const isMac = process.platform === 'darwin'

const APP_URL = process.env.FOOTBALLMANAGER_URL || 'https://footballmanager.io'

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'FootballManager.IO',
    backgroundColor: '#0d1f2d',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.loadURL(APP_URL)

  // External links (e.g. forum mentions, mailto:) open in the OS browser
  // instead of replacing the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) {
      return { action: 'allow' }
    }
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

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
