/* eslint-disable no-undef */
// OTA (over-the-air) update logic for the FootballManager.IO desktop app.
//
// This mirrors the iOS/Android NativeScript flow in `native-app/app/ota-update.ts`,
// but ships the *desktop* bundle (`client/assets/desktop-client.zip`) — the
// standard web app (app.js / GameLayout) rather than the mobile bottom-tab-bar
// shell. The web app is shipped *inside* the binary as a zip, extracted to a
// local directory and loaded from disk. On every launch we ask the server
// (`/assets/desktop-version.json`) whether a newer bundle exists; if so the new
// zip is downloaded into a staging dir and promoted on the next launch — so the
// running session is never swapped out underneath the user.
//
// State lives in `<userData>/ota-state.json`; web content lives in
// `<userData>/{bundled-web,ota-web,ota-web-staging}`.

const fs = require('fs')
const path = require('path')
const { app, net } = require('electron')
const AdmZip = require('adm-zip')

const PRODUCTION_URL = 'https://footballmanager.io'
const SANDBOX_URL = 'https://sandbox.footballmanager.io'

const BUNDLED_DIR_NAME = 'bundled-web'
const OTA_DIR_NAME = 'ota-web'
const STAGING_DIR_NAME = 'ota-web-staging'
const STATE_FILE_NAME = 'ota-state.json'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function userDataDir () {
  return app.getPath('userData')
}
function bundledDir () {
  return path.join(userDataDir(), BUNDLED_DIR_NAME)
}
function otaDir () {
  return path.join(userDataDir(), OTA_DIR_NAME)
}
function stagingDir () {
  return path.join(userDataDir(), STAGING_DIR_NAME)
}
function stateFile () {
  return path.join(userDataDir(), STATE_FILE_NAME)
}

/**
 * Locate the bundled `desktop-client.zip`. In a packaged build it is copied
 * next to the app via electron-builder `extraResources`; during local
 * development (`npm start`) it is read straight from the repo's
 * `client/assets/` output of `node scripts/build-desktop-bundle.mjs`.
 */
function resolveBundleZipPath () {
  const candidates = [
    path.join(process.resourcesPath || '', 'desktop-client.zip'),
    path.join(__dirname, 'assets', 'desktop-client.zip'),
    path.join(__dirname, '..', 'client', 'assets', 'desktop-client.zip')
  ]
  return candidates.find(p => p && fs.existsSync(p)) || null
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function loadState () {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf-8'))
  } catch {
    return {}
  }
}

function saveState (patch) {
  const next = { ...loadState(), ...patch }
  fs.writeFileSync(stateFile(), JSON.stringify(next, null, 2))
  return next
}

// ---------------------------------------------------------------------------
// Environment (prod / sandbox)
// ---------------------------------------------------------------------------

/** @returns {'production'|'sandbox'} */
function getEnvironment () {
  // An explicit env var wins (used by `npm run start:sandbox`); otherwise the
  // persisted choice, defaulting to production.
  if (process.env.FOOTBALLMANAGER_URL === SANDBOX_URL) return 'sandbox'
  return loadState().environment === 'sandbox' ? 'sandbox' : 'production'
}

function getServerUrl (env = getEnvironment()) {
  if (process.env.FOOTBALLMANAGER_URL) return process.env.FOOTBALLMANAGER_URL
  return env === 'sandbox' ? SANDBOX_URL : PRODUCTION_URL
}

// ---------------------------------------------------------------------------
// fs helpers
// ---------------------------------------------------------------------------

function rmDir (dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function isExtracted (dir) {
  return fs.existsSync(path.join(dir, 'index.html'))
}

function readZipVersion (zipPath) {
  try {
    const entry = new AdmZip(zipPath).getEntry('desktop-version.json')
    if (!entry) return null
    return JSON.parse(entry.getData().toString('utf-8'))
  } catch (e) {
    console.error('[OTA] Failed to read version from zip:', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Bundled content
// ---------------------------------------------------------------------------

/**
 * Extract the bundled zip into `bundled-web` on first launch and whenever the
 * shipped zip changed (i.e. the user installed a newer app binary). When the
 * bundle changes we also drop any cached OTA payload so the freshly-shipped
 * web app wins over a now-older OTA download — same policy as the mobile app.
 */
function ensureBundledExtracted () {
  const zipPath = resolveBundleZipPath()
  if (!zipPath) {
    console.error('[OTA] No bundled desktop-client.zip found — run `node scripts/build-desktop-bundle.mjs` first.')
    return
  }

  const zipVersion = readZipVersion(zipPath)
  const bundledHash = zipVersion ? zipVersion.commitHash : null
  const state = loadState()

  const needsExtract = !isExtracted(bundledDir()) || state.bundledHash !== bundledHash
  if (!needsExtract) return

  console.log(`[OTA] Extracting bundled web app (${bundledHash || 'unknown'})...`)
  rmDir(bundledDir())
  fs.mkdirSync(bundledDir(), { recursive: true })
  new AdmZip(zipPath).extractAllTo(bundledDir(), true)

  // A newer binary supersedes any previously downloaded OTA content.
  if (state.bundledHash && state.bundledHash !== bundledHash) {
    console.log('[OTA] App binary updated — clearing stale OTA cache.')
    rmDir(otaDir())
    rmDir(stagingDir())
    saveState({ localCommitHash: null })
  }

  saveState({ bundledHash })
}

// ---------------------------------------------------------------------------
// Staging / promotion
// ---------------------------------------------------------------------------

function hasStagedUpdate () {
  return isExtracted(stagingDir())
}

/**
 * Promote a staged update into the active OTA dir. Runs at launch, before the
 * window is created, so the WebView never holds files we're about to replace.
 * @returns {boolean} whether a staged update was promoted.
 */
function promoteStagingIfReady () {
  if (!hasStagedUpdate()) return false
  console.log('[OTA] Promoting staged update...')
  try {
    rmDir(otaDir())
    fs.mkdirSync(path.dirname(otaDir()), { recursive: true })
    fs.cpSync(stagingDir(), otaDir(), { recursive: true })
    if (!isExtracted(otaDir())) {
      console.error('[OTA] Promotion failed: index.html missing after copy.')
      return false
    }
    rmDir(stagingDir())
    console.log('[OTA] Staged update promoted.')
    return true
  } catch (e) {
    console.error('[OTA] Failed to promote staged update:', e)
    return false
  }
}

/**
 * Directory the WebView should load from: the OTA download if present,
 * otherwise the content shipped inside the binary.
 */
function getWebContentPath () {
  return isExtracted(otaDir()) ? otaDir() : bundledDir()
}

function getBundledCommitHash () {
  const v = readZipVersion(resolveBundleZipPath())
  return v ? v.commitHash : null
}

function getLocalCommitHash () {
  return loadState().localCommitHash || getBundledCommitHash()
}

// ---------------------------------------------------------------------------
// Update check
// ---------------------------------------------------------------------------

/**
 * Ask the server for the latest bundle and, if newer than what we have,
 * download + extract it into staging. The new content goes live on the next
 * launch via {@link promoteStagingIfReady}.
 * @returns {Promise<{ staged: boolean, version?: string, commitHash?: string }>}
 */
async function checkForUpdate () {
  try {
    const serverUrl = getServerUrl()
    const versionUrl = `${serverUrl}/assets/desktop-version.json`
    console.log('[OTA] Checking for update at:', versionUrl)

    const res = await net.fetch(versionUrl, { cache: 'no-store' })
    if (!res.ok) throw new Error(`version check HTTP ${res.status}`)
    const remote = await res.json()
    const localHash = getLocalCommitHash()

    console.log(`[OTA] Remote: ${remote.commitHash}, Local: ${localHash}`)
    if (remote.commitHash === localHash) {
      console.log('[OTA] Already up to date.')
      return { staged: false }
    }

    console.log('[OTA] New version available, downloading...')
    const zipRes = await net.fetch(`${serverUrl}/assets/desktop-client.zip`, { cache: 'no-store' })
    if (!zipRes.ok) throw new Error(`zip download HTTP ${zipRes.status}`)
    const buffer = Buffer.from(await zipRes.arrayBuffer())

    rmDir(stagingDir())
    fs.mkdirSync(stagingDir(), { recursive: true })
    new AdmZip(buffer).extractAllTo(stagingDir(), true)

    if (!isExtracted(stagingDir())) {
      console.error('[OTA] Extraction failed — index.html missing in staging.')
      rmDir(stagingDir())
      return { staged: false }
    }

    saveState({ localCommitHash: remote.commitHash })
    console.log('[OTA] Update staged — applies on next launch.')
    return { staged: true, version: remote.version, commitHash: remote.commitHash }
  } catch (error) {
    console.error('[OTA] Update check failed:', error)
    return { staged: false }
  }
}

module.exports = {
  PRODUCTION_URL,
  SANDBOX_URL,
  getEnvironment,
  getServerUrl,
  ensureBundledExtracted,
  promoteStagingIfReady,
  getWebContentPath,
  getLocalCommitHash,
  checkForUpdate
}
