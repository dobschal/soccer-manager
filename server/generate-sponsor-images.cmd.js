/**
 * Sponsor Image Generator
 *
 * This script generates SVG sponsor images based on the sponsor names in name-library.js.
 * Each sponsor gets a unique image with symbols matching their business type.
 *
 * Usage: node server/generate-sponsor-images.cmd.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { sponsorNames } from './lib/name-library.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const outputDir = path.join(__dirname, '../client/assets/sponsor-images')

// Sponsor configurations with colors and symbols
const sponsorConfigs = {
  'AeroTech Industries': {
    gradient: ['#1e3a5f', '#2d5a87'],
    symbol: 'aircraft'
  },
  'EcoFusion Solutions': {
    gradient: ['#1a472a', '#2d6a4f'],
    symbol: 'leaf'
  },
  'TruSports Apparel': {
    gradient: ['#c41e3a', '#e63946'],
    symbol: 'tshirt'
  },
  'GlobalTech Corporation': {
    gradient: ['#0a1628', '#1a365d'],
    symbol: 'globe'
  },
  'SwiftEnergy': {
    gradient: ['#ff6b00', '#ff9500'],
    symbol: 'lightning'
  },
  'OptiFit Nutrition': {
    gradient: ['#059669', '#10b981'],
    symbol: 'apple'
  },
  'Starlux Airlines': {
    gradient: ['#1e1b4b', '#312e81'],
    symbol: 'star'
  },
  'HyperDrive Motors': {
    gradient: ['#18181b', '#3f3f46'],
    symbol: 'wheel'
  },
  'AquaPure Water': {
    gradient: ['#0077b6', '#00b4d8'],
    symbol: 'waterdrop'
  },
  'SureGuard Security': {
    gradient: ['#1e3a5f', '#0f4c75'],
    symbol: 'shield'
  },
  'iTech Innovations': {
    gradient: ['#4338ca', '#6366f1'],
    symbol: 'lightbulb'
  },
  'EnerGize': {
    gradient: ['#dc2626', '#f97316'],
    symbol: 'battery'
  },
  'NovaTech Electronics': {
    gradient: ['#0f172a', '#1e293b'],
    symbol: 'chip'
  },
  'SkyHigh Investments': {
    gradient: ['#0369a1', '#0ea5e9'],
    symbol: 'arrow-up'
  },
  'PowerPlay Energy': {
    gradient: ['#7c2d12', '#c2410c'],
    symbol: 'play'
  },
  'CitiCom Telecommunications': {
    gradient: ['#1e40af', '#3b82f6'],
    symbol: 'signal'
  },
  'DreamCruise Vacations': {
    gradient: ['#0891b2', '#06b6d4'],
    symbol: 'ship'
  },
  'SuperiorSteel': {
    gradient: ['#374151', '#6b7280'],
    symbol: 'beam'
  },
  'MaxLife Insurance': {
    gradient: ['#14532d', '#166534'],
    symbol: 'umbrella'
  },
  'TechGenius': {
    gradient: ['#581c87', '#7c3aed'],
    symbol: 'brain'
  },
  'AlphaPrint': {
    gradient: ['#0f172a', '#334155'],
    symbol: 'printer'
  },
  'MegaFlex Gym': {
    gradient: ['#991b1b', '#dc2626'],
    symbol: 'dumbbell'
  },
  'CityScape Real Estate': {
    gradient: ['#1e3a5f', '#2563eb'],
    symbol: 'buildings'
  },
  'GloboVision Media': {
    gradient: ['#7c2d12', '#ea580c'],
    symbol: 'tv'
  },
  'UrbanBite Restaurants': {
    gradient: ['#92400e', '#d97706'],
    symbol: 'utensils'
  },
  'QuickFix Healthcare': {
    gradient: ['#0f766e', '#14b8a6'],
    symbol: 'medcross'
  },
  'PrimeTime Watches': {
    gradient: ['#78350f', '#a16207'],
    symbol: 'clock'
  },
  'Elevate Wealth Management': {
    gradient: ['#064e3b', '#047857'],
    symbol: 'chart'
  },
  'Vitality Health': {
    gradient: ['#be185d', '#ec4899'],
    symbol: 'heart'
  },
  'DynamicDrills': {
    gradient: ['#ca8a04', '#eab308'],
    symbol: 'drill'
  },
  'MegaPixel Cameras': {
    gradient: ['#18181b', '#3f3f46'],
    symbol: 'camera'
  },
  'FirstRate Finance': {
    gradient: ['#1e3a5f', '#1e40af'],
    symbol: 'number1'
  },
  'EcoMotion Electric Vehicles': {
    gradient: ['#065f46', '#059669'],
    symbol: 'ecar'
  },
  'SkyNet Internet': {
    gradient: ['#0c4a6e', '#0284c7'],
    symbol: 'cloud'
  },
  'SoundWave Audio': {
    gradient: ['#4c1d95', '#7c3aed'],
    symbol: 'waves'
  },
  'FreshHarvest Farms': {
    gradient: ['#65a30d', '#84cc16'],
    symbol: 'wheat'
  },
  'PowerUp Batteries': {
    gradient: ['#15803d', '#22c55e'],
    symbol: 'battery-full'
  }
}

function toKebabCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function generateSVG(sponsorName, config) {
  const [color1, color2] = config.gradient
  const id = toKebabCase(sponsorName)
  const nameParts = sponsorName.split(' ')
  const mainName = nameParts.slice(0, -1).join(' ') || sponsorName
  const subName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <defs>
    <linearGradient id="${id}Grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color1}"/>
      <stop offset="100%" style="stop-color:${color2}"/>
    </linearGradient>
  </defs>
  <rect width="200" height="100" fill="url(#${id}Grad)"/>
  <!-- Symbol placeholder for: ${config.symbol} -->
  <text x="100" y="45" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#fff" text-anchor="middle">${mainName.toUpperCase()}</text>
  ${subName ? `<text x="100" y="62" font-family="Arial, sans-serif" font-size="8" fill="#fff" opacity="0.8" text-anchor="middle">${subName.toUpperCase()}</text>` : ''}
</svg>`
}

function main() {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  console.log('Generating sponsor images...\n')

  for (const sponsorName of sponsorNames) {
    const config = sponsorConfigs[sponsorName]
    if (!config) {
      console.warn(`Warning: No config found for "${sponsorName}", skipping.`)
      continue
    }

    const filename = toKebabCase(sponsorName) + '.svg'
    const filepath = path.join(outputDir, filename)

    // Check if file already exists with detailed SVG
    if (fs.existsSync(filepath)) {
      console.log(`  [exists] ${filename}`)
      continue
    }

    const svg = generateSVG(sponsorName, config)
    fs.writeFileSync(filepath, svg)
    console.log(`  [created] ${filename}`)
  }

  console.log('\nDone! Images saved to:', outputDir)
}

main()
