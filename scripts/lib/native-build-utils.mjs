import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { join, resolve } from 'path'
import sharp from 'sharp'

/**
 * Remove and recreate output directory.
 */
export function cleanOutputDir(dir) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true })
  }
  mkdirSync(dir, { recursive: true })
}

/**
 * Copy client files to output dir, excluding test/.
 */
export function copyClientFiles(clientDir, outputDir) {
  console.log('Copying client files...')
  cpSync(clientDir, outputDir, {
    recursive: true,
    filter: (src) => !src.includes('/test/')
  })
}

/**
 * Copy vendor/ if source exists and destination is missing.
 */
export function copyVendorFiles(clientDir, outputDir) {
  const vendorSrc = resolve(clientDir, 'vendor')
  const vendorDest = resolve(outputDir, 'vendor')
  if (existsSync(vendorSrc)) {
    if (!existsSync(vendorDest)) {
      cpSync(vendorSrc, vendorDest, { recursive: true })
    }
    console.log('Vendor files copied.')
  } else {
    console.warn('WARNING: client/vendor/ not found. Run `npm run copy-vendor` in root first.')
  }
}

/**
 * Transform index.html for native builds: remove SEO tags, add native-app.css,
 * swap app.js → native-app.js, inject __NATIVE_SERVER_URL, shorten title.
 */
export function transformIndexHtml(clientDir, outputDir) {
  const originalHtml = readFileSync(resolve(clientDir, 'index.html'), 'utf-8')

  let html = originalHtml

  // Remove SEO meta tags (lines 9-38 of index.html)
  html = html.replace(/\s*<!-- SEO Meta Tags -->[\s\S]*?<meta name="twitter:image:alt"[^>]*>\n/m, '\n')

  // Add native-app.css link after the last CSS link
  html = html.replace(
    '<link rel="stylesheet" href="style/landing.css">',
    '<link rel="stylesheet" href="style/landing.css">\n    <link rel="stylesheet" href="style/native-app.css">'
  )

  // Inject __NATIVE_SERVER_URL before the module script, and change app.js to native-app.js
  html = html.replace(
    '<script src="app.js" defer type="module"></script>',
    `<script>window.__NATIVE_SERVER_URL = 'https://footballmanager.io';</script>
    <script src="native-app.js" defer type="module"></script>`
  )

  // Shorten title for native
  html = html.replace(
    '<title>FootballManager.IO - Free Online Football Manager Game</title>',
    '<title>FootballManager.IO</title>'
  )

  writeFileSync(resolve(outputDir, 'index.html'), html)
  console.log('Generated native index.html')
}

/**
 * Write native-version.json. Returns { version, commitHash }.
 */
export function writeVersionJson(outputDir, rootDir, commitHash) {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'))

  if (!commitHash) {
    try {
      commitHash = execSync('git rev-parse --short HEAD', {
        encoding: 'utf-8',
        cwd: rootDir
      }).trim()
    } catch {
      console.warn('WARNING: Could not get git commit hash, using "unknown"')
      commitHash = 'unknown'
    }
  }

  const versionData = { version: pkg.version, commitHash }
  writeFileSync(resolve(outputDir, 'native-version.json'), JSON.stringify(versionData, null, 2))
  console.log('Wrote native-version.json')
  return versionData
}

/**
 * Recursively compress PNGs > 4KB in-place using sharp (palette mode, quality 80).
 */
export async function compressPngs(dir) {
  const files = collectPngs(dir)
  let compressed = 0
  let savedBytes = 0

  for (const file of files) {
    const stat = statSync(file)
    if (stat.size <= 4096) continue

    const originalSize = stat.size
    const buffer = await sharp(file)
      .png({ palette: true, quality: 80 })
      .toBuffer()

    if (buffer.length < originalSize) {
      writeFileSync(file, buffer)
      savedBytes += originalSize - buffer.length
      compressed++
    }
  }

  if (compressed > 0) {
    console.log(`Compressed ${compressed} PNGs, saved ${(savedBytes / 1024).toFixed(0)} KB`)
  }
}

function collectPngs(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectPngs(full))
    } else if (entry.name.toLowerCase().endsWith('.png')) {
      results.push(full)
    }
  }
  return results
}

/**
 * Orchestrator: clean, copy, transform, version, compress.
 * @param {{ clientDir: string, outputDir: string, rootDir: string, commitHash?: string }} opts
 * @returns {Promise<{ version: string, commitHash: string }>}
 */
export async function prepareNativeWebDir({ clientDir, outputDir, rootDir, commitHash }) {
  cleanOutputDir(outputDir)
  copyClientFiles(clientDir, outputDir)
  copyVendorFiles(clientDir, outputDir)
  transformIndexHtml(clientDir, outputDir)
  const versionData = writeVersionJson(outputDir, rootDir, commitHash)
  await compressPngs(outputDir)
  return versionData
}
