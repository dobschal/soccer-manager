---
name: docs-sync
description: Check and update the user-facing documentation surfaces (requirements specs, in-game wiki, tutorial overlays, i18n strings) after implementing a feature or changing existing behavior. Use before committing any change that alters what the player sees, can do, or how a game mechanic works.
---

# Docs sync

Code changes that alter player-visible behavior leave four documentation
surfaces stale. Go through all four **before committing**. Skipping one is a
decision you must state out loud, not a default.

## 1. Requirements — `requirements/<feature>.md`

German feature specs. Update when behavior, formulas, limits, or table values
change.

- Find the matching file (the index lives in `CLAUDE.md` → "Requirements").
- Keep the existing structure: `## Beschreibung`, `## User Stories`
  (`**US-XXX-NN**: Als Spieler …`), value tables.
- New user-facing capability → add a new `US-XXX-NN` story, don't rewrite old ones.
- Brand-new feature → new `requirements/<kebab-name>.md` **and** a line in the
  `CLAUDE.md` requirements list.

## 2. In-game wiki — `server/data/wikiSeed.js`

Player-facing wiki, **English and German** per topic. Rendered as plain text
(HTML-escaped, `\n` → `<br>`) — no Markdown, use `•` bullets.

**The seed alone does not reach prod.** The initial seeding migration only runs
against an empty wiki, so an edited `WIKI_SEED` entry changes nothing on
prod/sandbox. Every wiki text change needs a migration appended to the end of
the array in `server/migrate-database.js`:

```js
{
  name: 'Wiki: <what changed> (#<issue>)',
  async run () {
    const KEYS_TO_REFRESH = ['<page-key>']   // existing topics whose text changed
    const KEYS_TO_ADD = []                   // brand-new topics
    for (const topic of WIKI_SEED) {
      if (KEYS_TO_REFRESH.includes(topic.key)) {
        for (const locale of ['en', 'de']) {
          const entry = topic[locale]
          await query(
            'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
            [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
          )
        }
      }
      if (KEYS_TO_ADD.includes(topic.key)) {
        for (const locale of ['en', 'de']) {
          const [existing] = await query(
            'SELECT id FROM wiki_entry WHERE page_key=? AND locale=? LIMIT 1',
            [topic.key, locale]
          )
          if (existing) continue
          const entry = topic[locale]
          await query('INSERT INTO wiki_entry SET ?', {
            locale,
            page_key: topic.key,
            title: entry.title,
            subtitle: entry.subtitle || null,
            text: entry.text,
            images: JSON.stringify([]),
            sort_order: 0
          })
        }
      }
    }
  }
}
```

Migrations must be idempotent and are append-only — never edit or reorder an
already-deployed entry.

A new page that carries a `wikiInfoIcon` needs a matching `key` in `WIKI_SEED`,
otherwise the info overlay opens empty.

## 3. Tutorial overlays

- Content: `getTutorials()` in `client/partials/tutorialOverlay.js` — titles,
  subtitles and `itemN` bullets, all via `t('tutorial.<key>.…')`.
- Strings: `client/i18n/en.js` **and** `client/i18n/de.js`.
- New page tutorial → add the key to `VALID_TUTORIAL_KEYS` in
  `server/routes/tutorial.js` (server rejects unknown keys) and extend
  `server/test/routes/tutorial.test.js`.
- Adding/removing a bullet → keep the `itemN` numbering contiguous in both
  locale files and in `getTutorials()`.

## 4. i18n

Every new user-facing string goes into `client/i18n/en.js` and
`client/i18n/de.js`. Never hardcode display text in a template literal.

## Not a surface

`native-app/web/` and `native-app/platforms/**` are build output (gitignored).
Never edit docs there.

## Report

End the task by stating per surface what happened, e.g.:

> Docs: requirements/stadium.md updated (US-STD-08), wikiSeed `stadium` refreshed
> + migration added, tutorial unchanged (no new page), i18n en/de extended.

"Not applicable" is a fine outcome — silence is not.
