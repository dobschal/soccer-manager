import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import archiver from 'archiver'
import { prepareNativeWebDir } from './lib/native-build-utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CLIENT_DIR = resolve(ROOT, 'client')
const TEMP_DIR = resolve(ROOT, '.native-bundle-temp')
const ASSETS_DIR = resolve(CLIENT_DIR, 'assets')
const ZIP_PATH = resolve(ASSETS_DIR, 'native-client.zip')
const VERSION_JSON_PATH = resolve(ASSETS_DIR, 'native-version.json')

// Get commit hash from CLI arg or git
const commitHash = process.argv[2] || execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()

console.log(`Building native bundle (${commitHash})...`)

// Prepare web dir (clean, copy, transform, compress)
const versionData = await prepareNativeWebDir({
  clientDir: CLIENT_DIR,
  outputDir: TEMP_DIR,
  rootDir: ROOT,
  commitHash
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

// Zip everything into client/assets/native-client.zip
await new Promise((resolve, reject) => {
  const output = createWriteStream(ZIP_PATH)
  const archive = archiver('zip', { zlib: { level: 9 } })

  output.on('close', () => {
    console.log(`Created native-client.zip (${(archive.pointer() / 1024).toFixed(0)} KB)`)
    resolve()
  })

  archive.on('error', reject)
  archive.pipe(output)
  archive.directory(TEMP_DIR, false)
  archive.finalize()
})

// Write standalone native-version.json for server-side version check
writeFileSync(VERSION_JSON_PATH, JSON.stringify(versionData, null, 2))
console.log('Wrote client/assets/native-version.json')

// Clean up temp dir
rmSync(TEMP_DIR, { recursive: true })

console.log('Done! Native bundle ready.')
