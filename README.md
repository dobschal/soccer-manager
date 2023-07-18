# Soccer Simulation

You need to have a MySQL database running and NodeJS installed.

Inside the `src` folder various scripts are available:
* `api.js` to start the web server with API
* `migrate-database.js` to setup the database tables
* `prepare-season.js` to fill the database with bot teams and games to play
* `play-game-day.js` calculate the results for the next game day

A UI is implemented. When you run the API, you can open the UI on http://localhost:3000

## Get Started
Run the scripts as described above to migrate the database and prepare the season. Then to start the Game UI, run:
```bash
# Install all dependencies
npm install

# Start game...
npm start
```

## Features

- [x] Aufstieg/Abstieg
- [x] Game Calculation
- [x] User can change Lineup
- [x] User registration
- [x] Season preparation script
- [ ] Train Players
- [ ] Trade Players
- [ ] Injured Players + red/yellow cards

### Train Players

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
- [ ] Add carrier_start and end to entity
- [ ] Adjust player creation to give not too strong players
- [ ] On Season preparation, archive too old players
- [ ] Implement card appearing
- [ ] Implement card actions