# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Soccer Manager IO - a browser-based football manager game where players build teams, compete in leagues, and manage finances. Full-stack Node.js application with MySQL database.

## Commands

```bash
# Development
docker compose up database -d
DB_HOST=localhost IS_DEVELOPMENT=true node server/api.js
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
- **Server communication**: Proxy-based gateway (`lib/gateway.js`) - `server.functionName(...params)` calls `/api/functionName`
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

## League System

The game uses a hierarchical league structure with levels and subdivisions:

### Structure
- **Level**: Represents the division tier (0 = top division, higher = lower divisions)
- **League**: The subdivision index within a level
- Each level has `2^level` leagues:
  - Level 0: 1 league (the top division)
  - Level 1: 2 leagues (North, South)
  - Level 2: 4 leagues (North, South, East, West)
  - Level 3: 8 leagues (adds North-East, South-East, etc.)
  - Level 4: 16 leagues (adds North-North-East, etc.)
- Each league contains up to 18 teams

### Display Names
League names combine the division number with a compass direction:
- A team at level 1, league 1 displays as "2. South"
- A team at level 2, league 3 displays as "3. West"
- Subdivision names are translated (see `client/util/league.js` and `client/i18n/`)

### Team Assignment
- New users are assigned to bot teams in existing leagues
- When all bot teams are taken, new leagues are created with fresh bot teams
- Teams are distributed across leagues to maintain ~18 teams per league
- Season preparation (`server/prepare-season.js`) handles league assignment

### Promotion/Relegation
- Top teams in a league get promoted to a higher division (lower level number)
- Bottom teams get relegated to a lower division (higher level number)

## Tech Stack

- **Backend**: Node.js 20, Express 4.18, MySQL 8.0, JWT auth
- **Frontend**: Vanilla JS (ES6 modules), Three.js, Chart.js, Bootstrap CSS
- **Testing**: Vitest with jsdom (client) and Node environment (server)
- **Deployment**: Docker/Docker Compose, GitHub Actions CI/CD
