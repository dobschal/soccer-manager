export default {
  // Auth errors
  'error.usernameString': 'Username needs to be string',
  'error.passwordString': 'Password needs to be string',
  'error.passwordLength': 'Password needs to be string longer than 8 characters',
  'error.usernameTaken': 'Username already taken',
  'error.noTeamAvailable': 'No team available.',
  'error.wrongCredentials': 'Wrong credentials',
  'error.notAuthorized': 'Not authorized',
  'error.invalidLanguage': 'Invalid language',

  // Trade errors
  'error.playerNotFound': 'Player not found',
  'error.playerNotOnMarket': 'Player is not on the market',
  'error.cannotBuyOwnPlayer': 'You cannot buy your own player',
  'error.notEnoughMoney': 'Not enough money',
  'error.offerNotFound': 'Offer not found',
  'error.notYourOffer': 'This is not your offer',
  'error.notYourPlayer': 'This is not your player',
  'error.playerAlreadyListed': 'Player is already listed',
  'error.invalidOfferValue': 'Invalid offer value',
  'error.offerTooLow': 'Offer is too low',

  // Stadium errors
  'error.standNotFound': 'Stand not found',
  'error.standUnderConstruction': 'This stand is already under construction',
  'error.standAlreadyHasRoof': 'This stand already has a roof',
  'error.cannotExpandFurther': 'Cannot expand further',
  'error.invalidTicketPrice': 'Invalid ticket price',

  // Player errors
  'error.invalidPosition': 'Invalid position',
  'error.positionAlreadyTaken': 'Position is already taken',
  'error.playerNotInTeam': 'Player is not in your team',

  // Action card errors
  'error.cardNotFound': 'Action card not found',
  'error.cardAlreadyPlayed': 'This card has already been played',
  'error.cannotMergeCards': 'Cannot merge these cards',
  'error.notEnoughCards': 'Not enough cards to merge',
  'error.invalidCardAction': 'Invalid card action',
  'error.playerMaxLevelUps': 'Player already got 2 level ups this season',
  'error.playerMaxLevel': 'Player already reached the maximum level',
  'error.cardMaxLevel7': 'Action card only allows level ups until level 7',
  'error.cardMaxLevel4': 'Action card only allows level ups until level 4',
  'error.goalkeeperCannotChange': 'Goalkeepers cannot change their position',
  'error.cannotBecomeGoalkeeper': 'Players cannot become goalkeepers',

  // Generic errors
  'error.invalidRequest': 'Invalid request',
  'error.serverError': 'Server error',

  // Log messages - Welcome
  'log.welcome': 'Hey {username}! The president of {teamName} is sending you a warm welcome!',

  // Log messages - Lineup warnings
  'log.incompleteLineup': 'Warning: Your lineup only has {count} players! You need 11 players for optimal performance.',
  'log.lowFreshness': 'Warning: {playerName} has low freshness ({freshness}%). Consider resting them.',

  // Log messages - Trades
  'log.playerSold': '{playerName} has been sold to {buyerTeam} for {price}!',
  'log.playerBought': '{playerName} has been bought from {sellerTeam} for {price}!',
  'log.offerReceived': 'You received an offer of {price} for {playerName} from {fromTeam}.',
  'log.offerAccepted': 'Your offer for {playerName} has been accepted!',
  'log.offerRejected': 'Your offer for {playerName} has been rejected.',

  // Log messages - Action cards
  'log.cardLevelUp': '{playerName} has leveled up to level {level}!',
  'log.cardFreshness': '{playerName}\'s freshness has been restored to 100%!',
  'log.cardMoney': 'You received a bonus of {amount}!',
  'log.cardYouth': 'A new youth talent {playerName} has joined your team!',
  'log.cardsMerged': 'Cards have been merged into a more powerful card!',

  // Log messages - Stadium
  'log.stadiumExpansionStarted': 'Construction started: {stand} expansion to {newSize} seats.',
  'log.stadiumExpansionComplete': 'Construction complete: {stand} now has {newSize} seats!',
  'log.roofConstructionStarted': 'Construction started: Roof for {stand}.',
  'log.roofConstructionComplete': 'Construction complete: {stand} now has a roof!',

  // Log messages - Season
  'log.seasonEnd': 'Season {season} has ended!',
  'log.promoted': 'Congratulations! You have been promoted to League {league}!',
  'log.relegated': 'Unfortunately, you have been relegated to League {league}.',
  'log.champion': 'You are the champion of League {league}!',

  // Log messages - Match
  'log.matchWin': 'Victory! You won {goalsFor}-{goalsAgainst} against {opponent}!',
  'log.matchDraw': 'Draw! {goalsFor}-{goalsAgainst} against {opponent}.',
  'log.matchLoss': 'Defeat. You lost {goalsFor}-{goalsAgainst} against {opponent}.',

  // Log messages - Player career
  'log.playerRetired': '{playerName} has retired from professional football.',
  'log.playerInjured': '{playerName} is injured and will miss the next game.',
  'log.playerFired': 'You fired your player {playerName}.',
  'log.playerSigned': 'Congratulations! You signed a new player contract with {playerName}.',

  // Finance reasons
  'finance.playerSalaries': 'Player salaries',
  'finance.ticketRevenue': 'Ticket revenue',
  'finance.sponsorPayment': 'Sponsor payment',
  'finance.playerSold': 'Player sold: {playerName}',
  'finance.playerBought': 'Player bought: {playerName}',
  'finance.stadiumExpansion': 'Stadium expansion: {stand}',
  'finance.roofConstruction': 'Roof construction: {stand}',
  'finance.actionCardBonus': 'Action card bonus',
  'finance.leagueBonus': 'League bonus',
  'finance.promotionBonus': 'Promotion bonus',
  'finance.startingBalance': 'Starting balance',

  // News headlines
  'news.topScorer': 'Top Scorer: {playerName} ({goals} goals)',
  'news.bestTeam': 'Best team: {teamName}',
  'news.worstTeam': 'Struggling: {teamName}',
  'news.bigWin': 'Dominant victory: {team1} {score} {team2}',
  'news.upset': 'Upset! {team1} defeats {team2}',
  'news.promotion': '{teamName} promoted to League {league}',
  'news.relegation': '{teamName} relegated to League {league}',
  'news.champion': '{teamName} wins the League {league} championship!',
  'news.newSeason': 'Season {season} has started!'
}
