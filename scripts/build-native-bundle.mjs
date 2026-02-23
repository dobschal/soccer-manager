import { cpSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import archiver from 'archiver'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ROOT = resolve(__dirname, '..')
const CLIENT_DIR = resolve(ROOT, 'client')
const TEMP_DIR = resolve(ROOT, '.native-bundle-temp')
const ASSETS_DIR = resolve(CLIENT_DIR, 'assets')
const ZIP_PATH = resolve(ASSETS_DIR, 'native-client.zip')
const VERSION_JSON_PATH = resolve(ASSETS_DIR, 'native-version.json')

// Get commit hash from CLI arg or git
const commitHash = process.argv[2] || execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()

// Read version from package.json
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'))
const version = pkg.version

console.log(`Building native bundle: v${version} (${commitHash})`)

// Clean previous temp dir
if (existsSync(TEMP_DIR)) {
  rmSync(TEMP_DIR, { recursive: true })
}

// Copy client/ to temp dir, excluding test/
console.log('Copying client files...')
cpSync(CLIENT_DIR, TEMP_DIR, {
  recursive: true,
  filter: (src) => !src.includes('/test/')
})

// Ensure vendor/ exists
const vendorSrc = resolve(CLIENT_DIR, 'vendor')
const vendorDest = resolve(TEMP_DIR, 'vendor')
if (existsSync(vendorSrc) && !existsSync(vendorDest)) {
  cpSync(vendorSrc, vendorDest, { recursive: true })
}

// Generate modified index.html (same logic as copy-web-assets.mjs)
const originalHtml = readFileSync(resolve(CLIENT_DIR, 'index.html'), 'utf-8')

let nativeHtml = originalHtml

// Remove SEO meta tags
nativeHtml = nativeHtml.replace(/\s*<!-- SEO Meta Tags -->[\s\S]*?<meta name="twitter:image:alt"[^>]*>\n/m, '\n')

// Add native-app.css link
nativeHtml = nativeHtml.replace(
  '<link rel="stylesheet" href="style/landing.css">',
  '<link rel="stylesheet" href="style/landing.css">\n    <link rel="stylesheet" href="style/native-app.css">'
)

// Inject __NATIVE_SERVER_URL and swap entry to native-app.js
nativeHtml = nativeHtml.replace(
  '<script src="app.js" defer type="module"></script>',
  `<script>window.__NATIVE_SERVER_URL = 'https://footballmanager.io';</script>
    <script src="native-app.js" defer type="module"></script>`
)

// Update title
nativeHtml = nativeHtml.replace(
  '<title>FootballManager.IO - Free Online Football Manager Game</title>',
  '<title>FootballManager.IO</title>'
)

writeFileSync(resolve(TEMP_DIR, 'index.html'), nativeHtml)
console.log('Generated native index.html')

// Write native-version.json inside the web dir
const versionData = {
  version,
  commitHash
}
writeFileSync(resolve(TEMP_DIR, 'native-version.json'), JSON.stringify(versionData, null, 2))
console.log('Wrote native-version.json into bundle')

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
