# Soccer Simulation

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

## Features

- [x] Promotion / Relegation
- [x] Game Calculation
- [x] User can change Lineup
- [x] User registration
- [x] Season preparation script
- [x] Players ages
- [x] Train Players
- [x] Action Cards
- [x] Sponsors and Sallary
- [ ] Show player info incl. sallary in modal
- [ ] Deploy to server and CRON jobs
- [ ] Have different level up action cards -- level up to 10 is rare and level up to 4 common
- [ ] Stadium (Render, earn, costs, build)
- [ ] Trade Players
- [ ] Log/Mailbox to see what happened when
- [ ] Injured Players + red/yellow cards
- [ ] Localisation
- [ ] Wappen
- [ ] Torschützen Liste
- [ ] Zweikampf-Sieger
- [ ] Action card should expire
- [ ] Hidden (weak) random on player level


### Financial (Sponsor, Stadium, Trading)

A team has three way to earn money
* stadium ticket selling
* selling players
* sponsors

A team has fix costs
* player sallaries
* stadium maintenance

Optional costs /invests:
* buying new better players
* raise the stadium

Player sallaries per game day are fixed to:
```javascript
[
  0,
  150, // level 1
  225,
  337,
  506, 
  759, // level 5
  1139,
  1709, 
  2562,
  3844, 
  5767 // level 10
]
```
Having 11 players level 10 would cost 2,156,858 € per season

**Tasks**
- [x] Give team start balance of 100 000 €
- [x] let team pay sallary on every game day


#### Sponsors

* Sponsor make offers for contracts from 3 to 34 game days
* If the contract goes 8 days, we look up the last 8 games of the team.
* 8 wins of 8 games would be 100%, 4 wins of 8 games 50% ...
* minimum is 33% --> needed for very first season too
* 100% of 34 days in level 0 contract is 2,156,858 €
** 100% = 63.437 € per gameday in level 0
* For each level down it's * 0.8

sponsor money per gameday 
```javascript
[
  63437, // level 0
  50749,
  40599,
  32479, // level 3
  25983,
  ...
]
```

--> If you win all games and have level 10 players, the money should roughly enough... :)
But if you loose a game with only level 10 players, the money would be enough anymore... uiuiui

**Tasks**
- [x] Add entity sponsor with user_id, start_game_day, start_season, duration, value_per_game_day
- [x] Show new random contracts to player if no active sponsor available
- [x] Give team money from sponsor on each game_day


### Train Players / Action Cards

Per played game day, a user gets a card. Each card triggers an action. 
Cards: 
* Level up player, chance 1/3 --> 11x per season
* Change position of player, 1/30 --> once per season
* Get new youth player, 1/30 --> once per season
* no card --> else

Players do have an age from 16 to 40 to play the carrier.
Youth Players have a level 1 - 3 and age 16 - 18 --> best would be 16/3
Players end their carrier in the age between 36 to 40

In average a user should be able to level 11 players once per season
--> 34 games per season, chance of level up card is 1/3 --> 11x level up
In ideal case, a 16/3 players would be 23/10

Maybe have leveup card change at 1/4 --> 11x per season would be too much

Tasks:
- [x] Add carrier_start and end to entity
- [x] Adjust player creation to give not too strong players
- [x] On Season preparation, archive too old players
- [x] Implement card appearing
- [x] Implement card actions