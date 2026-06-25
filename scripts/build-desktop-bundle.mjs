import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import archiver from 'archiver'
import { prepareNativeWebDir } from './lib/native-build-utils.mjs'

// Builds the Electron desktop bundle. Unlike the mobile bundle (which swaps in
// native-app.js + the bottom tab bar), the desktop bundle ships the standard
// web app (app.js / GameLayout) — the mobile tab bar looks out of place in a
// desktop window. It still loads from local disk and talks to the live server.

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CLIENT_DIR = resolve(ROOT, 'client')
const TEMP_DIR = resolve(ROOT, '.desktop-bundle-temp')
const ASSETS_DIR = resolve(CLIENT_DIR, 'assets')
const ZIP_PATH = resolve(ASSETS_DIR, 'desktop-client.zip')
const VERSION_JSON_PATH = resolve(ASSETS_DIR, 'desktop-version.json')
const VERSION_FILE_NAME = 'desktop-version.json'

// Get commit hash from CLI arg or git
const commitHash = process.argv[2] || execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()

console.log(`Building desktop bundle (${commitHash})...`)

// Prepare web dir (clean, copy, transform, compress) — desktop variant
const versionData = await prepareNativeWebDir({
  clientDir: CLIENT_DIR,
  outputDir: TEMP_DIR,
  rootDir: ROOT,
  commitHash,
  variant: 'desktop',
  versionFileName: VERSION_FILE_NAME
})

console.log(`Version: v${versionData.version}`)

// Ensure assets dir exists
if (!existsSync(ASSETS_DIR)) {
  mkdirSync(ASSETS_DIR, { recursive: true })
}

// Remove old zip if present
if (existsSync(ZIP_PATH)) {
  rmSync(ZIP_PATH)
}

// Zip everything into client/assets/desktop-client.zip
await new Promise((resolve, reject) => {
  const output = createWriteStream(ZIP_PATH)
  const archive = archiver('zip', { zlib: { level: 9 } })

  output.on('close', () => {
    console.log(`Created desktop-client.zip (${(archive.pointer() / 1024).toFixed(0)} KB)`)
    resolve()
  })

  archive.on('error', reject)
  archive.pipe(output)
  archive.directory(TEMP_DIR, false)
  archive.finalize()
})

// Write standalone desktop-version.json for server-side version check
writeFileSync(VERSION_JSON_PATH, JSON.stringify(versionData, null, 2))
console.log('Wrote client/assets/desktop-version.json')

// Clean up temp dir
rmSync(TEMP_DIR, { recursive: true })

console.log('Done! Desktop bundle ready.')
