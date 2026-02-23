import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ROOT = resolve(__dirname, '..')
const CLIENT_DIR = resolve(ROOT, '..', 'client')
const WEB_DIR = resolve(ROOT, 'web')

// Clean previous build
if (existsSync(WEB_DIR)) {
  rmSync(WEB_DIR, { recursive: true })
}

// Copy client/ to web/, excluding test/
console.log('Copying client files to web/...')
cpSync(CLIENT_DIR, WEB_DIR, {
  recursive: true,
  filter: (src) => !src.includes('/test/')
})

// Ensure vendor/ exists (must have run `npm run copy-vendor` in root first)
const vendorSrc = resolve(CLIENT_DIR, 'vendor')
const vendorDest = resolve(WEB_DIR, 'vendor')
if (existsSync(vendorSrc)) {
  if (!existsSync(vendorDest)) {
    cpSync(vendorSrc, vendorDest, { recursive: true })
  }
  console.log('Vendor files copied.')
} else {
  console.warn('WARNING: client/vendor/ not found. Run `npm run copy-vendor` in root first.')
}

// Generate modified index.html
const originalHtml = readFileSync(resolve(CLIENT_DIR, 'index.html'), 'utf-8')

let nativeHtml = originalHtml

// Remove SEO meta tags (description, keywords, author, robots, canonical, theme-color, og:*, twitter:*)
nativeHtml = nativeHtml.replace(/\s*<!-- SEO Meta Tags -->[\s\S]*?<!-- Open Graph[\s\S]*?<meta name="twitter:image:alt"[^>]*>\n/m, '\n')

// Add native-app.css link after the last CSS link
nativeHtml = nativeHtml.replace(
  '<link rel="stylesheet" href="style/landing.css">',
  '<link rel="stylesheet" href="style/landing.css">\n    <link rel="stylesheet" href="style/native-app.css">'
)

// Inject __NATIVE_SERVER_URL before the module script, and change app.js to native-app.js
nativeHtml = nativeHtml.replace(
  '<script src="app.js" defer type="module"></script>',
  `<script>window.__NATIVE_SERVER_URL = 'https://footballmanager.io';</script>
    <script src="native-app.js" defer type="module"></script>`
)

// Update title for native
nativeHtml = nativeHtml.replace(
  '<title>FootballManager.IO - Free Online Football Manager Game</title>',
  '<title>FootballManager.IO</title>'
)

writeFileSync(resolve(WEB_DIR, 'index.html'), nativeHtml)
console.log('Generated native index.html')

// Write native-version.json into the web dir for bundled builds
const pkg = JSON.parse(readFileSync(resolve(ROOT, '..', 'package.json'), 'utf-8'))
let commitHash = 'unknown'
try {
  commitHash = execSync('git rev-parse --short HEAD', {
    encoding: 'utf-8',
    cwd: resolve(ROOT, '..')
  }).trim()
} catch (e) {
  console.warn('WARNING: Could not get git commit hash, using "unknown"')
}
const versionData = {
  version: pkg.version,
  commitHash
}
writeFileSync(resolve(WEB_DIR, 'native-version.json'), JSON.stringify(versionData, null, 2))
console.log('Wrote native-version.json')

console.log('Done! Web assets ready in native-app/web/')
