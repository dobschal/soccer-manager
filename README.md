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

### Run native iOS app

This will start the iOS simulator and run the native iOS app. Make sure you have Xcode installed and properly set up.

```bash
npm run native:ios
```

## Deployment

Use docker compose to deploy the application. There is a restart script that rebuilds the docker images and restarts the
containers.
Ensure to create the docker network first:

```bash
docker network create soccer-manager
```

## Structure

The project is structured into three main directories:

- `server`: Contains the backend API built with Node.js and Express. It handles all the game logic, database
  interactions, and serves the frontend.
- `client`: Contains the frontend built with a custom UIElement class based framework. It provides the user interface
  for managing the soccer teams, players, and matches.

For more details on the implementation, please refer to the [CLAUDE.md](CLAUDE.md) file, which contains an in-depth
analysis of the codebase and design decisions.


