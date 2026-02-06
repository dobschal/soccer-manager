# Soccer Simulation

⚽️ This is a soccer manager simulation game built with Node.js and MySQL.
Further details about the implementation can be found here: [CLAUDE.md](CLAUDE.md)

[![CI](https://github.com/dobschal/soccer-manager/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/dobschal/soccer-manager/actions/workflows/ci.yml)

## Get Started

You need to have a MySQL database running and NodeJS installed.
Take a look into the docker files to check the version used for the database and nodejs.

1. (Optional) Use IntelliJ to open the project and set the environment variable for `DB_HOST` and `IS_DEVELOPMENT`.
2. Start the database with `docker compose up database -d` or any other way you like.
3. Then run via IntelliJ or Terminal `DB_HOST=localhost IS_DEVELOPMENT=true node server/api.js`
4. You can open the UI on http://localhost:3000

Inside the server folder several scripts exists that are executed via CRON job when `api.js` is running.

## Scripts

Here are some script that help you to setup and run the simulation manually:

```bash
# Prepare database
node server/migrate-database.cmd.js

# Setup teams and games
node server/prepare-season.cmd.js

# calculate the games for the current gameday ---> repeat for each game day to play
node server/play-game-day.cmd.js
```

## Deployment

Use docker compose to deploy the application. There is a restart script that rebuilds the docker images and restarts the
containers.
Ensure to create the docker network first:

```bash
docker network create soccer-manager
```

