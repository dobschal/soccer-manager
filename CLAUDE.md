# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FootballManager.IO - a browser-based football manager game where players build teams, compete in leagues, and manage
finances. Full-stack Node.js application with MySQL database.

## Workflow

After every code change, **always** run tests and linting before considering the task done:

```bash
npm test    # All tests must pass
npm run lint # No lint errors allowed
```

If a test or lint check fails, fix the issue before moving on.

### Documentation is part of the change

Whenever a change alters what the player sees, can do, or how a game mechanic
works, **invoke the `docs-sync` skill before committing** and work through its
checklist: `requirements/*.md`, the in-game wiki (`server/data/wikiSeed.js`
*plus* a migration), tutorial overlays, and the `en`/`de` i18n files.

This is not optional and not "nice to have later" — a feature is only done when
its documentation matches it. Report per surface what you updated, or why it
did not apply. Pure refactorings, build/CI changes and internal-only fixes are
exempt.

### E2E integration tests (manual)

There is a separate heavy suite under `server/test/integration/` that runs
against a real MySQL container (per-file throwaway schema). It is **not**
part of `npm test` and not part of CI — kick it off manually:

```bash
docker compose up database -d
npm run test:integration       # ~4 min total (10 tests in 4 files)
```

Run it **occasionally** — at minimum:

- whenever touching `prepare-season.js`, `play-game-day.js`,
  `helper/cupHelper.js`, or anything else that affects season/cup
  scheduling, promotion/relegation, or the user-registration → team-choice
  flow,
- before merging `develop` → `main` if any of the above were changed in
  the diff.

If the suite is failing on something unrelated to your change, treat it
like any other failing test — don't merge over red.

### Branch model & deployment

- `main` → deploys to **production** (https://footballmanager.io) on every push.
- `develop` → deploys to **sandbox** (https://sandbox.footballmanager.io) on every push.
- The default branch in GitHub stays `main`; releases and version bumps only happen on `main`.

When asked to build a feature or fix a bug:

1. Work on the `develop` branch (create/checkout `develop`, base it on `main` if needed).
2. Extend or add tests covering the change. Run `npm test` and `npm run lint`.
3. Commit and push `develop`. CI runs lint+test and then redeploys the sandbox.
4. **Do not merge `develop` into `main` automatically.** The user does the final prod release manually by merging `develop` → `main` when the change has been verified in sandbox.

### Ticket workflow

The Kanban board lives at https://github.com/users/dobschal/projects/1 (project number `1`, owner `dobschal`).
Statuses are `Backlog` → `Next` → `In Progress` → `Review` → `Done`. The user moves tickets to `Done` after
the change is verified in production.

When the user provides a ticket number (e.g. "implement #251"), follow these steps:

1. **Read the ticket** with `gh issue view <number> --repo dobschal/soccer-manager` to get title, body, and labels.
2. **Move to `In Progress`** on the project board *before* starting work (see snippet below).
3. **Implement on `develop`**: switch to `develop`, pull, then make the change.
4. **Extend tests**: add or extend tests under the matching `test/` folder so the new behavior is covered.
5. **Sync the docs**: invoke the `docs-sync` skill (requirements, wiki seed + migration, tutorial, i18n).
6. **Verify locally**: run `npm test` and `npm run lint`. Fix anything that fails before continuing.
7. **Commit & push** to `develop`. Reference the ticket in the commit message (e.g. `fix: SEO meta tags (#251)`)
   so GitHub auto-links the issue. Pushing triggers CI which redeploys sandbox.
8. **Wait for CI green & sandbox deploy**, then **move the ticket to `Review`**. Do not merge into `main`.

Project board IDs (for `gh project item-edit`):

- Project ID: `PVT_kwHOAPJwEM4BOoBP`
- Status field ID: `PVTSSF_lAHOAPJwEM4BOoBPzg9Raf4`
- Status option IDs: `In Progress` = `47fc9ee4`, `Review` = `c83bbafb`, `Done` = `98236657`,
  `Next` = `7b181db2`, `Backlog` = `f75ad846`

```bash
# Find the project item ID for an issue (board item != issue number)
ITEM_ID=$(gh project item-list 1 --owner dobschal --format json --limit 200 \
  | jq -r '.items[] | select(.content.number == <issue-number>) | .id')

# Move to "In Progress"
gh project item-edit --id "$ITEM_ID" --project-id PVT_kwHOAPJwEM4BOoBP \
  --field-id PVTSSF_lAHOAPJwEM4BOoBPzg9Raf4 --single-select-option-id 47fc9ee4

# Move to "Review" (after sandbox deploy)
gh project item-edit --id "$ITEM_ID" --project-id PVT_kwHOAPJwEM4BOoBP \
  --field-id PVTSSF_lAHOAPJwEM4BOoBPzg9Raf4 --single-select-option-id c83bbafb
```

If the ticket is not yet on the board, add it first via `gh project item-add 1 --owner dobschal --url <issue-url>`,
then proceed with the status edit.

## Commands

```bash
# Development
docker compose up database -d
DB_HOST=localhost node server/api.js
# Opens at http://localhost:3000

# Testing
npm test                        # Run all tests
npm run test:client             # Client tests only
npm run test:client:watch       # Client tests in watch mode
npm run test:server             # Server tests only
npm run test:server:watch       # Server tests in watch mode

# Linting
npm run lint

# Manual game simulation scripts
node server/migrate-database.cmd.js   # Setup database schema
node server/prepare-season.cmd.js     # Create teams and leagues
node server/play-game-day.cmd.js      # Simulate one game day
```

## Architecture

### Backend (`server/`)

- **Entry point**: `api.js` - Express app that auto-loads all routes
- **API pattern**: Each file in `routes/` exports functions that become POST endpoints at `/api/{functionName}`
- **Request format**: `{ params: [...] }` - function receives spread params + `req` object
- **Authentication**: JWT-based, token in `Authorization: Bearer` header, user attached to `req.user`
- **Database**: MySQL with connection pool in `lib/database.js`, supports transactions
- **CRON jobs**: Run every 12 hours (midnight/noon) - season prep, bot moves, game calculation

Key directories:

- `routes/` - API endpoint handlers
- `entities/` - Domain models
- `helper/` - Business logic
- `lib/` - Utilities (database, errors, name generation)

### Frontend (`client/`)

- **Entry point**: `app.js` - initializes router with page mappings
- **Routing**: Hash-based client-side router (`lib/router.js`)
- **Components**: Class-based extending `UIElement` base class
- **Server communication**: Proxy-based gateway (`lib/gateway.js`) - `server.functionName(...params)` calls
  `/api/functionName`
- **Caching**: Gateway auto-caches `get*` methods for 60 seconds

Key directories:

- `pages/` - Page components (dashboard, my-team, trades, finances, stadium, results)
- `partials/` - Reusable UI widgets
- `layouts/` - Page layout templates
- `lib/` - Client utilities

### Adding New Features

- **New API endpoint**: Create/edit file in `server/routes/` with exported function
- **New page**: Create component in `client/pages/` extending `UIElement`, register in **both** `client/app.js` and
  `client/native-app.js` routers
- **New tests**: Mirror file path with `.test.js` in respective `test/` folder

### Dual client entry points

The web bundle boots from `client/app.js`. The native build (iOS WKWebView /
Android WebView) is produced by `scripts/lib/native-build-utils.mjs#transformIndexHtml`,
which swaps the `<script src="app.js">` tag for `<script src="native-app.js">`.

`client/native-app.js` is a **separate, hand-maintained entry point** with its
own page registrations and its own list of global inits (locale, swipe-back,
pull-to-refresh, tab-bar animation, websocket, …).

**Rule:** whenever you add or remove a top-level init / global listener /
page registration in `app.js`, mirror the change in `native-app.js`.

**Debugging rule:** when a bug reproduces only on iOS / Android WebView but
works in the browser, first verify the relevant module is actually loaded by
`native-app.js` before investigating platform quirks.

### Styling Rules

- **Never use inline styles** in JavaScript template literals. All styles must be defined in CSS files under
  `client/style/`.
    - The only exception is when the style value is truly dynamic (computed from a JS variable at render time, e.g.
      `width: ${size}px`). Static properties must always use CSS classes.
    - Utility classes (e.g. `u-cursor-pointer`, `u-nowrap`, `u-max-w-620`) live in `client/style/utilities.css`.
    - Component-specific styles go in the matching CSS file (e.g. `components/player.css`, `pages/dashboard.css`).

### Re-render scoping (smooth updates)

- **Update the smallest UIElement that owns the changed state**, not its parent. When a parent's template contains
  nested UIElements via `${new Child(...)}`, calling `parent.update()` re-creates those children — each goes through
  `renderSync()` which renders an empty `<template>` placeholder first and fills it async in the next frame. The visible
  gap shrinks `width: fit-content` containers (e.g. overlays) and looks like a close/reopen flicker.
    - Cache nested UIElement instances on the parent (lazy-init in `get template` or in `load()`).
    - After a state change, mutate the child's `players`/`data`/etc. fields and call `child.update()` instead of
      `parent.update()`.
    - For sibling DOM the parent itself owns (a card stack, a toggle button, a count badge), do surgical `innerHTML`/
      `outerHTML` updates instead of re-rendering the whole parent.
    - Reference: `client/partials/selectPlayerOverlay.js` — `_useActionCard` caches `this._playerList` and refreshes the
      action-cards section in place.

### Bootstrap first

- **Prefer Bootstrap classes over custom CSS** for layout, spacing, typography, and standard components. The project
  ships Bootstrap; reach for `d-flex`, `gap-*`, `row`/`col-*`, `btn`, `card`, `alert`, `form-control`, `mt-*`/`mb-*`/
  `p-*` before writing new selectors.
- Only add component-specific CSS for things Bootstrap doesn't cover (the lineup pitch, action card stacks, custom
  emblems, the 3D stadium view, etc.).

### Theme colors

- **Use the `info` theme for highlighted/important UI**: `btn-info`, `text-info`, `bg-info`, `alert-info`,
  `border-info`, `btn-outline-info`. This is the project's accent color.
- Reserve `success` / `danger` / `warning` for their semantic meanings (positive outcomes, errors, caution).
- `primary` / `secondary` aren't customarily used here — replace them with `info` / `outline-info` / `outline-secondary`
  when adapting external snippets.

## Requirements

Detailed feature specifications are in the `requirements/` directory:

- [Action Cards](requirements/action-cards.md) - Kartensystem fuer Spieler-Upgrades und Events
- [Bot-Teams](requirements/bots.md) - KI-gesteuerte Teams, Balancing nach Liga-Level
- [Buildings](requirements/buildings.md) - Gebaeude und Infrastruktur
- [Event Based UI Updates](requirements/event-based-updates.md) - WebSocket-Events und UIElement-Selbstaktualisierung
- [Forum](requirements/forum.md) - Community-Forum
- [Game Calculation](requirements/game-calculation.md) - Spielsimulation, Bundesliga-Statistiken, Taktik-Auswirkungen
- [Game Modes](requirements/game-modes.md) - Spielmodi
- [Landing Page](requirements/landing-page.md) - Startseite
- [Player Fitness](requirements/player-fitness.md) - Spieler-Frische und Ermuedung
- [Player Injuries](requirements/player-injuries.md) - Spieler-Verletzungen
- [Player Salary](requirements/player-sallary.md) - Gehaltsberechnung (exponentiell, Level 1-100)
- [Player Suspension](requirements/player-suspension.md) - Sperren durch Karten
- [Player Transfers](requirements/player-transfers.md) - Transfermarkt und Marktwert
- [Sponsoring](requirements/sponsoring.md) - Sponsoring-System
- [Stadium](requirements/stadium.md) - Stadion-Ausbau und Ticketeinnahmen
- [Team Emblems](requirements/team-emblems.md) - Team-Wappen
- [Team Lineups](requirements/team-lineups.md) - Aufstellungen und Formationen
- [Team Names](requirements/team-names.md) - Team-Namengenerierung
- [Team Tactics](requirements/team-tactics.md) - Angriffsmodus, Spielstil, Passstil
- [User Registration](requirements/user-registration.md) - Registrierung und Authentifizierung
- [Youth Players](requirements/youth-players.md) - Jugendspieler-System und Training
- [Youth Academy](requirements/youth-academy.md) - Jugendakademie-Gebaeude und Jugendspieler-Karten

## Production Database Access

The prod database runs as a MySQL 8.0 container (`soccer-manager-database-1`) on the Hetzner host.
Claude can connect via the preconfigured SSH alias `hetzner` to inspect or analyze prod data
(e.g. when the user mentions a specific game, team, or player ID and asks for an investigation).

```bash
# Run a query against the prod database
ssh hetzner "docker exec soccer-manager-database-1 mysql -uroot -proot -D soccer -e 'SELECT * FROM game WHERE id = 12345 LIMIT 1;'"

# Open an interactive MySQL shell (only useful when running manually, not from Claude)
ssh hetzner "docker exec -it soccer-manager-database-1 mysql -uroot -proot soccer"
```

- Database name: `soccer`, user: `root`, password: `root` (only reachable inside the container).
- Treat prod data as **read-only** unless the user explicitly asks for a write/fix.
- Never dump or copy personal user data (emails, password hashes) outside the server.

## Deployments on Hetzner

Both production and sandbox run on the same Hetzner host using the same `docker-compose.yml`,
parametrized via env vars. The compose file uses `APP_PORT`, `DB_PORT`, `NETWORK_NAME`, and
`COMPOSE_PROJECT_NAME` so prod defaults stay unchanged.

| Environment | Branch    | URL                                | Path                                       | App port | DB port | Docker network           | Project name             |
|-------------|-----------|------------------------------------|--------------------------------------------|----------|---------|--------------------------|--------------------------|
| Production  | `main`    | https://footballmanager.io         | `/root/deployments/soccer-manager`         | `3013`   | `3306`  | `soccer-manager`         | `soccer-manager`         |
| Sandbox     | `develop` | https://sandbox.footballmanager.io | `/root/deployments/soccer-manager-sandbox` | `3014`   | `3307`  | `soccer-manager-sandbox` | `soccer-manager-sandbox` |

Sandbox specifics:

- Push notifications are **disabled** (`APN_*` / `FCM_*` are intentionally empty in the sandbox `.env`).
- Email verification **is enabled** on sandbox and uses the same IONOS SMTP credentials as prod (`SMTP_*` mirrored in
  the sandbox `.env`). `EMAIL_FROM` is set to `FootballManager.IO Sandbox <…>` and
  `PUBLIC_URL=https://sandbox.footballmanager.io` so the verification link points back to sandbox.
- The sandbox database starts empty; run schema migration / season prep against the sandbox DB the same way as locally.
- Sandbox container names are prefixed `soccer-manager-sandbox-*` (e.g. `soccer-manager-sandbox-database-1`).

Inspect the sandbox DB the same way as prod:

```bash
ssh hetzner "docker exec soccer-manager-sandbox-database-1 mysql -uroot -proot -D soccer -e 'SELECT COUNT(*) FROM game;'"
```

### Persistent data layout

Prod and sandbox MySQL data and user uploads (forum, avatars, friend-posts) live on a separate
20 GB Hetzner volume mounted at `/mnt/HC_Volume_105947620`, **not** on the root disk. The
`docker-compose.yml` references bind mounts via the `DATA_ROOT` env var, which is set per stack
in `.env`:

| Stack   | `DATA_ROOT`                        |
|---------|------------------------------------|
| Prod    | `/mnt/HC_Volume_105947620/prod`    |
| Sandbox | `/mnt/HC_Volume_105947620/sandbox` |
| Local   | `./data` (default, gitignored)     |

Each `DATA_ROOT` contains `mysql/` (mounted at `/var/lib/mysql`, owned by uid 999) and
`uploads/{forum,avatars,friend-posts}/`. When adding a new persistent data directory, add a
bind mount under `${DATA_ROOT}/...` in compose — do **not** use a named volume.

### CI deploy rewrites `.env`

The `deploy-prod` and `deploy-sandbox` jobs in `.github/workflows/ci.yml` rewrite the server's
`.env` from scratch via a heredoc on every push. Anything appended to `.env` on the server
manually will be wiped on the next deploy. When adding a new env var the running app needs,
edit **both** heredoc blocks in `ci.yml` — not just the server `.env`.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues in `dobschal/soccer-manager` (use the `gh` CLI); work is also tracked on the project board at <https://github.com/users/dobschal/projects/1>. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

## Tech Stack

- **Backend**: Node.js 20, Express 4.18, MySQL 8.0, JWT auth
- **Frontend**: Vanilla JS (ES6 modules), Three.js, Chart.js, Bootstrap CSS
- **Testing**: Vitest with jsdom (client) and Node environment (server)
- **Deployment**: Docker/Docker Compose, GitHub Actions CI/CD
