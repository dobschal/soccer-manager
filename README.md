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
- [x] Stadium (Render, earn, costs, build)
- [x] Fix roof prices expand build
- [x] Fix double registration request
- [x] Finances Log
- [x] show when the next game takes place
- [x] Deploy to server and CRON jobs
- [x] Show how many guests were on game
- [x] Show player info incl. salary in modal
- [x] Trade / Fire Players --> have a players profile in a modal with a buy action
- [x] Action Cards: Have different level up action cards -- level up to 10 is rare and level up to 4 common
- [x] Action Card: Merge low level action cards to get better once
- [x] Set team money to X€ on registration
- [x] Bot Players (trading etc.)
- [x] Finance Chart
- [x] Fix Finance chart
- [x] Fix bots not buying players
- [ ] bugs: save button on tactic, card title in sponsor
- [ ] fitness of players 
- [x] quit players 
- [ ] show open player on open market
- [x] bot players adjust ticket prices
- [ ] Action Card "Earn Money Gift"
- [ ] game summary with formation, gosls wirh minute and stats
- [ ] Have news with top games, stadium expansion plans and top trades
- [ ] Log/Mailbox to see what happened when
- [ ] Injured Players + red/yellow cards
- [ ] Localisation
- [ ] Wappen
- [x] Torschützen Liste
- [ ] Zweikampf-Sieger
- [ ] Hidden (weak) random on player level
- [ ] Player Faces
- [ ] Stadium Build should take some time
- [ ] iOS App
- [ ] Show other teams stadiums
- [ ] show other teams league and info


### Stadium

4 stands, north, south, east, west
each with three levels, small, middle, big
roof, or not

**amount of guests to come PER STAND!**
team_strength_a * team_strength_b ≈ between 900 and 12100 = strength_faktor
average_price = 13€
lower price, e.g. 11 -> 13 / 11 = 1.18 = price_faktor
higher price, e.g. 16 --> 13 / 16 = 0.81 = price_faktor
faktor 3 is fix
strength_faktor * price_faktor * 3 * (if roof 1.2)

**Example big:**
Stands: 20k each
Price: 15 € each stand
Teams: 95 x 105 (strong teams first league)
Roofs: Yes
95 * 105 = 9975
13 / 15 = 0.87
9975 * 0.87 * 3 * 1.2 * 4 = 124 967 --> nice, vermutlich ausverkauft
--> 1.87 mio € --> 32 mio € per season

**Example small:**
Stands: 100 each
Price: 13 € each stand
Teams: 35 x 45 (weak teams third league)
Roofs: no
35 * 45 = 1575
13 / 13 = 1
1575 * 1 * 3 * 1 * 4 = 18 900 --> nice
--> 245 700 € --> 4.2mio € per season if stadium is 20k
if 400 places only --> 88 400 € per season

**Stadium building price?**

big stand 20k - 40k
mid stand 5k - 20k
small stand 100 - 5k
--> build small stand fully (5k) should be 50 000
--> one seat costs 10 €
--> level up cost, small to mid = 1mio, mid to big = 10mio

when building --> change seat size and level


**Tasks**
- [ ] Entity Stadium with size and level per stand
- [ ] per game calculate guests and store with game details and give money
- [ ] add UI to build and view stadium


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
