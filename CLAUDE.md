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
- **New page**: Create component in `client/pages/` extending `UIElement`, register in `app.js` router
- **New tests**: Mirror file path with `.test.js` in respective `test/` folder

### Styling Rules

- **Never use inline styles** in JavaScript template literals. All styles must be defined in CSS files under `client/style/`.
  - The only exception is when the style value is truly dynamic (computed from a JS variable at render time, e.g. `width: ${size}px`). Static properties must always use CSS classes.
  - Utility classes (e.g. `u-cursor-pointer`, `u-nowrap`, `u-max-w-620`) live in `client/style/utilities.css`.
  - Component-specific styles go in the matching CSS file (e.g. `components/player.css`, `pages/dashboard.css`).

## Requirements

Detailed feature specifications are in the `requirements/` directory:

- [Action Cards](requirements/action-cards.md) - Kartensystem fuer Spieler-Upgrades und Events
- [Bot-Teams](requirements/bots.md) - KI-gesteuerte Teams, Balancing nach Liga-Level
- [Buildings](requirements/buildings.md) - Gebaeude und Infrastruktur
- [Forum](requirements/forum.md) - Community-Forum
- [Game Calculation](requirements/game-calculation.md) - Spielsimulation, Bundesliga-Statistiken, Taktik-Auswirkungen
- [Game Modes](requirements/game-modes.md) - Spielmodi
- [Landing Page](requirements/landing-page.md) - Startseite
- [News](requirements/news.md) - News & Log-Nachrichten
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

## Tech Stack

- **Backend**: Node.js 20, Express 4.18, MySQL 8.0, JWT auth
- **Frontend**: Vanilla JS (ES6 modules), Three.js, Chart.js, Bootstrap CSS
- **Testing**: Vitest with jsdom (client) and Node environment (server)
- **Deployment**: Docker/Docker Compose, GitHub Actions CI/CD
