# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Soccer Manager IO - a browser-based football manager game where players build teams, compete in leagues, and manage
finances. Full-stack Node.js application with MySQL database.

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

## Youth Players

Youth players appear in the age of 15 with level between 0.1 and 1.0 and can be brought to the A Team at 16, latest 18.
Add a database migration to give each team with 3 random youth players.
The action card "YOUTH_PLAYER" should appear 3 times in average per season, giving the user the chance to acquire a new
youth player.
The my-team page should have two tabs: "A Team" and "Youth Team". The youth team tab should show the youth players.
Besides the standard player properties, each youth player has the following properties:

- level
- talent
- moral
- fitness

talent, moral and fitness are float numbers between 0 and 1.
The talent value is hidden for the user and only used for the game logic. The moral and fitness values are shown to the
user and can be improved by training or matches.
The Youth Team tab should show two buttons per player: "Promote" and "Fire". The promote button moves the player to the
A Team
and the fire button deletes the player.
The promote button is only active if the player is 16 or older. The fire button is always active.
If a youth player gets 19 years old and is not promoted, he is automatically fired. So when the player gets 18 years
old, show a warning in the log messages that the player will be fired in the next season if not promoted.

On the Youth Team tab the user can select between three different options for the game day:

- training
- friendly match
- rest

training improves the fitness of the youth players, but will lower the moral. It improves the level a bit.
friendly match improves the moral of the players, but will lower the fitness. It improves the level a bit.
rest improves the moral and fitness of the players, but does not improve the level.
It should always apply little randomness of about 10%. So the user cannot always predict the exact outcome of the
training, friendly match or rest.

The ideal rhythm is two gamedays training, one gameday friendly match and one gameday rest. So the user has to find the
right balance between training, friendly matches and rest to improve the youth players and get them ready for the A
Team.

The improvement per game day should be calculated based on the following:
A youth player appearing with talent = 1.0 and level = 1, while having the perfect training rhythm, should reach level 3
while being 16 years old.
At minimum, a youth player should reach level 1 while being 18 years old, even with the worst training rhythm. So the
training rhythm should have a significant impact on the development of the youth players.

There should be test cases for the youth player development logic, including the effects of training, friendly matches,
and rest on the player's level, moral, and fitness.

## Play Style

The user can choose a play style for their team, which affects the team's performance in matches.
The play style can be one of the following:

- aggressive: Increases the chances to win the ball, but also increases the chances to get yellow or red cards.
- normal: No changes to the team's performance.
- friendly: Decreases the chances to win the ball, but also decreases the chances to get yellow or red cards.

If a player get two yellow cards in a match, they get a red card and are sent off for the rest of the match.
If a player gets a red card, they are sent off for the rest of the match and also miss the next match.
The play style should have a significant impact on the team's performance in matches, and the user should be able to see
the effects of their chosen play style in the match results.

Check the _fightsOpponents method in play-game-day.js for the implementation of the play style logic in matches.

The playerList shown in team.js and my-team.js should show per player the number of yellow and red cards they have.
A player with a red card or 5 yellow cards should be marked as unavailable (cannot be put into lineup) for the next
match and should be removed from the lineup automatically. After the next match, the red card and yellow cards should be
reset to 0.
A log message should be shown when a player gets a yellow or red card, and when a player is unavailable for the next
match due to cards.

Test should cover the play style logic in matches, including the chances to win the ball and get cards, as well as the
effects of cards on player availability.
Check that the overall statistics are still similar to the stats of the Bundesliga in terms of goals per match, yellow
cards per match, and red cards per match. Run tests to check which play style gives the best results in terms of wins,
goals scored, and cards received.

## Tech Stack

- **Backend**: Node.js 20, Express 4.18, MySQL 8.0, JWT auth
- **Frontend**: Vanilla JS (ES6 modules), Three.js, Chart.js, Bootstrap CSS
- **Testing**: Vitest with jsdom (client) and Node environment (server)
- **Deployment**: Docker/Docker Compose, GitHub Actions CI/CD
