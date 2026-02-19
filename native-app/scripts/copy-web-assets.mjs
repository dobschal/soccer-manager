import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
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

// Generate native-app.css
const nativeCssDir = resolve(WEB_DIR, 'style')
mkdirSync(nativeCssDir, { recursive: true })

writeFileSync(resolve(nativeCssDir, 'native-app.css'), `/* Native app overrides */
.native-app-layout {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

.native-app-layout .navbar {
  padding-top: env(safe-area-inset-top);
}

.native-app-layout .container {
  padding-bottom: env(safe-area-inset-bottom);
}

/* Hide footer in native app */
.app-footer {
  display: none !important;
}

/* Native feel: disable text selection except in inputs */
body {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

input, textarea, [contenteditable] {
  -webkit-user-select: text;
  user-select: text;
}

/* Prevent overscroll bounce */
html, body {
  overscroll-behavior: none;
}
`)
console.log('Generated native-app.css')

// Generate modified index.html
const originalHtml = readFileSync(resolve(CLIENT_DIR, 'index.html'), 'utf-8')

let nativeHtml = originalHtml

// Remove SEO meta tags (description, keywords, author, robots, canonical, theme-color, og:*, twitter:*)
nativeHtml = nativeHtml.replace(/\s*<!-- SEO Meta Tags -->[\s\S]*?<!-- Open Graph[\s\S]*?<meta name="twitter:image:alt"[^>]*>\n/m, '\n')

// Update viewport to disable user scaling
nativeHtml = nativeHtml.replace(
  'width=device-width, initial-scale=1, shrink-to-fit=no',
  'width=device-width, initial-scale=1, shrink-to-fit=no, user-scalable=no, viewport-fit=cover'
)

// Add native-app.css link after the last CSS link
nativeHtml = nativeHtml.replace(
  '<link rel="stylesheet" href="style/landing.css">',
  '<link rel="stylesheet" href="style/landing.css">\n    <link rel="stylesheet" href="style/native-app.css">'
)

// Inject __NATIVE_SERVER_URL before the module script, and change app.js to native-app.js
nativeHtml = nativeHtml.replace(
  '<script src="app.js" defer type="module"></script>',
  '<script>window.__NATIVE_SERVER_URL = \'https://soccermanager.io\';</script>\n    <script src="native-app.js" defer type="module"></script>'
)

// Update title for native
nativeHtml = nativeHtml.replace(
  '<title>Soccer Manager IO - Free Online Football Manager Game</title>',
  '<title>SoccerManager</title>'
)

writeFileSync(resolve(WEB_DIR, 'index.html'), nativeHtml)
console.log('Generated native index.html')

console.log('Done! Web assets ready in native-app/web/')
