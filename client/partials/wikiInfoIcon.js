import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { showOverlay } from './overlay.js'
import { getLocale, t } from '../i18n/index.js'
import { linkifyHtml } from '../lib/linkify.js'
import { wikiImageUrl } from '../pages/wiki.js'

function escapeHtml (text) {
  const div = document.createElement('div')
  div.textContent = text ?? ''
  return div.innerHTML
}

/**
 * Render the article body of a wiki entry (same rendering as the wiki page).
 * @param {object} entry
 * @returns {string}
 */
function renderArticle (entry) {
  const images = (entry.images || []).map(name =>
    `<img src="${wikiImageUrl(name)}" alt="${escapeHtml(entry.title)}" class="wiki-image" loading="lazy">`
  ).join('')
  const body = linkifyHtml(entry.text || '', (escaped) => escaped.replace(/\n/g, '<br>'))
  return `
    <article class="wiki-article">
      ${entry.subtitle ? `<p class="text-muted">${escapeHtml(entry.subtitle)}</p>` : ''}
      ${images ? `<div class="wiki-images mb-3">${images}</div>` : ''}
      <div class="wiki-text">${body}</div>
    </article>
  `
}

/**
 * Open an overlay with the wiki article linked to the given page key (#456).
 * @param {string} pageKey
 */
export async function openWikiArticleOverlay (pageKey) {
  let entry = null
  try {
    const result = await server.getWikiArticleByPageKey(pageKey, getLocale())
    entry = result?.entry ?? null
  } catch {
    entry = null
  }
  if (!entry) {
    showOverlay(t('wiki.title'), '', `<p class="text-muted">${t('wiki.selectEntry')}</p>`, { small: true })
    return
  }
  // Deep-link to the full wiki page for this article.
  const moreLink = entry.id
    ? `<div class="mt-3"><a href="#dashboard?sub_page=wiki&id=${entry.id}">${t('wiki.title')} &rarr;</a></div>`
    : ''
  showOverlay(entry.title, '', `${renderArticle(entry)}${moreLink}`)
}

/**
 * Open an overlay with a wiki entry loaded by its id (#455). Used by contexts
 * that already have the entry list (e.g. the landing page wiki section).
 * @param {number} id
 */
export async function openWikiEntryById (id) {
  let entry = null
  try {
    const result = await server.getWikiEntry(id)
    entry = result?.entry ?? null
  } catch {
    entry = null
  }
  if (!entry) {
    showOverlay(t('wiki.title'), '', `<p class="text-muted">${t('wiki.selectEntry')}</p>`, { small: true })
    return
  }
  showOverlay(entry.title, '', renderArticle(entry))
}

/**
 * Render an info icon that opens the wiki article for the given page key in an
 * overlay (#456). Place it directly after a page heading's text.
 *
 * @param {string} pageKey - stable wiki page key (see server/data/wikiSeed.js)
 * @returns {string} HTML for the icon (click handler is wired automatically)
 */
export function wikiInfoIcon (pageKey) {
  const id = generateId()
  onClick('#' + id, (e) => {
    e.preventDefault()
    e.stopPropagation()
    openWikiArticleOverlay(pageKey)
  })
  return `<i id="${id}" class="fa fa-info-circle wiki-info-icon" role="button" tabindex="0" aria-label="${t('wiki.infoIconLabel')}" title="${t('wiki.infoIconLabel')}"></i>`
}
