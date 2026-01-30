# Soccer Simulation
![CI](https://github.com/dobschal/soccer-manager/actions/workflows/ci.yml/badge.svg)
![deployment](https://github.com/dobschal/soccer-manager/actions/workflows/deploy.yml/badge.svg)

## Get Started
You need to have a MySQL database running and NodeJS installed.
Take a look into the docker files to check the version used for the database and nodejs.

1. Use IntelliJ to open the project and set the environment variable for the database host.
2. Start the database with docker compose or any other way you like.
3. Then run `src/api.js`, you can open the UI on http://localhost:3000

> ⚠️ All scripts are automatically executed when running the `api.js` script!

```bash
DB_HOST=localhost IS_DEVELOPMENT=true node src/api.js
```

## Scripts
Here are some script that help you to setup and run the simulation:
```bash
# Prepare database
node src/migrate-database.cmd.js

# Setup teams and games
node src/prepare-season.cmd.js

# calculate the games for the current gameday ---> repeat for each game day to play
node src/play-game-day.cmd.js
```
