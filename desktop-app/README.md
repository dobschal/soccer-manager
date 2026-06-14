# FootballManager.IO Desktop App

Electron-based desktop wrapper for [FootballManager.IO](https://footballmanager.io).

The desktop build is a thin Electron shell that loads the production web app
inside a native window. There's intentionally no separate JS bundle — the
desktop client always shows the **browser** flow (no native tab bar), exactly
as configured in `client/app.js`.

## Running locally

```bash
cd desktop-app
npm install      # one-time: pulls electron + electron-builder
npm start        # opens https://footballmanager.io in a desktop window
npm run start:sandbox   # opens the sandbox build instead
```

## Building distributables

`electron-builder` produces installers in `../dist-desktop/`:

```bash
npm run dist:mac     # .dmg / .zip for macOS
npm run dist:win     # NSIS installer + portable .exe for Windows
npm run dist:linux   # AppImage + .deb for Linux
npm run dist         # all three (requires macOS / Windows / Linux hosts)
```

For Steam distribution, use the produced binaries (e.g. the macOS .app inside
the .dmg, the unpacked Windows folder from `--dir`) as the Steamworks depot
content. Code signing is required for both macOS notarisation and Windows
SmartScreen — configure `CSC_LINK` / `WIN_CSC_LINK` env vars per the
[electron-builder docs](https://www.electron.build/code-signing).

## Why a thin shell?

The web build already handles auth, websocket, push, OTA-style refresh, etc.
Embedding logic in the Electron main process would force us to maintain a
second client. Loading `https://footballmanager.io` keeps the desktop app
self-updating: any deploy is picked up on the next launch.
