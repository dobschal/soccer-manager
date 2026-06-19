# FootballManager.IO Desktop App

Electron-based desktop client for [FootballManager.IO](https://footballmanager.io),
intended for Steam distribution on macOS, Windows and Linux.

## How it works

The desktop app works **just like the iOS / Android apps**: the web client is
bundled *inside* the binary and loaded from local disk, while API and websocket
traffic still go to the live server. There is no separate desktop JS — it reuses
the exact same `native-client.zip` the mobile builds ship.

- **Bundled web app** — `../client/assets/native-client.zip` (produced by
  `node scripts/build-native-bundle.mjs`) is packaged as an Electron
  `extraResource`. On first launch it is extracted into the user-data dir and
  served through a custom `app://` scheme. A custom scheme is required because
  the client uses ES modules, which Chromium refuses to load over `file://`.
- **OTA self-update** (`ota.cjs`) — on every launch the app fetches
  `<server>/assets/native-version.json`, compares the commit hash, and if a
  newer bundle exists downloads `<server>/assets/native-client.zip` into a
  staging dir. The update is promoted on the **next** launch, so the running
  session is never swapped out underneath the user. This mirrors
  `native-app/app/ota-update.ts`.
- **Server target** — production by default; `npm run start:sandbox` (or
  `FOOTBALLMANAGER_URL=…`) points the bundle's `__NATIVE_SERVER_URL` at sandbox.

> **Server requirement:** the API allows the desktop app's `app://` origin via
> CORS (see `server/api.js`). This must be deployed before the desktop app can
> talk to that environment — otherwise API calls fail with `TypeError: Failed
> to fetch`.

## Running locally

```bash
cd desktop-app
npm install                 # pulls electron, electron-builder, adm-zip
npm start                   # production server
npm run start:sandbox       # sandbox server
```

`npm start` reads the bundled zip from `../client/assets/native-client.zip`, so
run `node scripts/build-native-bundle.mjs` from the repo root first if it's
missing.

## Building distributables

`electron-builder` produces installers in `../dist-desktop/`. The `predist*`
scripts rebuild the web bundle first so the shipped zip is current:

```bash
npm run dist:mac     # .dmg / .zip for macOS
npm run dist:win     # NSIS installer + portable .exe for Windows
npm run dist:linux   # AppImage + .deb for Linux
npm run dist         # all three (requires the matching host OS)
```

For Steam, use the produced binaries as the Steamworks depot content. Code
signing is required for both macOS notarisation and Windows SmartScreen —
configure `CSC_LINK` / `WIN_CSC_LINK` per the
[electron-builder docs](https://www.electron.build/code-signing).
