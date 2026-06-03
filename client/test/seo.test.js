import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const clientRoot = join(__dirname, '..')

const PRIMARY_DOMAIN = 'https://footballmanager.io'

describe('SEO – index.html meta tags', () => {
  const html = readFileSync(join(clientRoot, 'index.html'), 'utf8')

  it('declares HTML language', () => {
    expect(html).toMatch(/<html\s+lang="en">/)
  })

  it('has a non-empty title and description', () => {
    expect(html).toMatch(/<title>FootballManager\.IO[^<]*<\/title>/)
    expect(html).toMatch(/<meta\s+name="description"[\s\S]*?content="[^"]{40,}"/)
  })

  it('uses footballmanager.io as the canonical primary domain', () => {
    expect(html).toMatch(/<link\s+rel="canonical"\s+href="https:\/\/footballmanager\.io\/"\s*>/)
  })

  it('does not point canonical/og:url at the secondary soccermanager.io domain', () => {
    expect(html).not.toMatch(/rel="canonical"[^>]*soccermanager\.io/)
    expect(html).not.toMatch(/property="og:url"[^>]*soccermanager\.io/)
  })

  it('exposes Open Graph tags pointing at the primary domain', () => {
    expect(html).toMatch(/property="og:title"[^>]*content="[^"]+"/)
    expect(html).toMatch(/property="og:description"[^>]*content="[^"]+"/)
    expect(html).toMatch(new RegExp(`property="og:url"[^>]*content="${PRIMARY_DOMAIN}/"`))
    expect(html).toMatch(new RegExp(`property="og:image"[^>]*content="${PRIMARY_DOMAIN}/assets/og-preview\\.jpg"`))
    expect(html).toMatch(/property="og:image:type"[^>]*content="image\/jpeg"/)
    expect(html).toMatch(/property="og:image:width"[^>]*content="\d+"/)
    expect(html).toMatch(/property="og:image:height"[^>]*content="\d+"/)
    expect(html).toMatch(/property="og:type"[^>]*content="website"/)
  })

  it('exposes Twitter Card tags with absolute image URL', () => {
    expect(html).toMatch(/name="twitter:card"[^>]*content="summary_large_image"/)
    expect(html).toMatch(new RegExp(`name="twitter:image"[^>]*content="${PRIMARY_DOMAIN}/assets/og-preview\\.jpg"`))
  })

  it('exposes a parseable schema.org JSON-LD block', () => {
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(match, 'JSON-LD script tag missing').toBeTruthy()
    const data = JSON.parse(match[1])
    expect(data['@context']).toBe('https://schema.org')
    expect(Array.isArray(data['@graph'])).toBe(true)
    const types = data['@graph'].map(n => n['@type'])
    expect(types).toContain('WebSite')
    expect(types).toContain('VideoGame')
  })

  it('allows search engines to index the site', () => {
    expect(html).toMatch(/<meta\s+name="robots"\s+content="index,\s*follow"\s*>/)
  })

  it('exposes the iOS Safari smart app banner meta tag', () => {
    expect(html).toMatch(/<meta\s+name="apple-itunes-app"\s+content="app-id=6759547142"\s*>/)
  })
})

describe('SEO – robots.txt', () => {
  const robots = readFileSync(join(clientRoot, 'robots.txt'), 'utf8')

  it('allows the root path for all user agents', () => {
    expect(robots).toMatch(/User-agent:\s*\*/)
    expect(robots).toMatch(/Allow:\s*\//)
  })

  it('disallows crawling of API and uploads', () => {
    expect(robots).toMatch(/Disallow:\s*\/api\//)
    expect(robots).toMatch(/Disallow:\s*\/uploads\//)
  })

  it('points crawlers at the sitemap on the primary domain', () => {
    expect(robots).toMatch(new RegExp(`Sitemap:\\s*${PRIMARY_DOMAIN}/sitemap\\.xml`))
  })
})

describe('SEO – sitemap.xml', () => {
  const sitemap = readFileSync(join(clientRoot, 'sitemap.xml'), 'utf8')

  it('declares an XML sitemap urlset', () => {
    expect(sitemap).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    expect(sitemap).toMatch(/<urlset[\s\S]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/)
  })

  it('lists the primary domain as a URL entry', () => {
    expect(sitemap).toMatch(new RegExp(`<loc>${PRIMARY_DOMAIN}/</loc>`))
  })

  it('declares hreflang alternates for supported languages', () => {
    expect(sitemap).toMatch(/hreflang="en"/)
    expect(sitemap).toMatch(/hreflang="de"/)
    expect(sitemap).toMatch(/hreflang="x-default"/)
  })
})

describe('SEO – site.webmanifest', () => {
  const manifest = JSON.parse(readFileSync(join(clientRoot, 'assets/site.webmanifest'), 'utf8'))

  it('has non-empty name and short_name', () => {
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
  })

  it('declares standalone display and a start URL', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
  })

  it('declares the native Play Store and App Store apps as related applications', () => {
    expect(Array.isArray(manifest.related_applications)).toBe(true)
    const play = manifest.related_applications.find(a => a.platform === 'play')
    const itunes = manifest.related_applications.find(a => a.platform === 'itunes')
    expect(play?.url).toBe('https://play.google.com/store/apps/details?id=io.soccermanager.app')
    expect(play?.id).toBe('io.soccermanager.app')
    expect(itunes?.url).toBe('https://apps.apple.com/de/app/footballmanager-io/id6759547142')
  })
})
