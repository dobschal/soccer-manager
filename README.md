# Soccer Simulation
![deployment](https://github.com/dobschal/soccer-manager/actions/workflows/deploy.yml/badge.svg)

You need to have a MySQL database running and NodeJS installed.

Inside the `src` folder various scripts are available:
* `api.js` to start the web server with API
* `migrate-database.js` to setup the database tables
* `prepare-season.js` to fill the database with bot teams and games to play
* `play-game-day.js` calculate the results for the next game day

A UI is implemented. When you run the API, you can open the UI on http://localhost:3000

> !!! When starting the API with `api.js`, the other scripts are executed via CRON job automatically

## Run it
Run the scripts as described here:
```bash
# Install all dependencies
npm install

# Prepare database
node src/migrate-database.cmd.js

# Setup teams and games
node src/prepare-season.cmd.js

# calculate the games for the current gameday ---> repeat for each game day to play
node src/play-game-day.cmd.js

# Start game UI on port 3000
npm start
```
