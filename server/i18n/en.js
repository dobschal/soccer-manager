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

  // Youth player errors
  'error.youthPlayerNotFound': 'Youth player not found',
  'error.notYourYouthPlayer': 'This is not your youth player',
  'error.youthPlayerTooYoung': 'Youth player must be at least 16 years old to be promoted',

  // Action card errors
  'error.cardNotFound': 'Action card not found',
  'error.cardAlreadyPlayed': 'This card has already been played',
  'error.cannotMergeCards': 'Cannot merge these cards',
  'error.notEnoughCards': 'Not enough cards to merge',
  'error.invalidCardAction': 'Invalid card action',
  'error.playerMaxLevelUps': 'Player already got 2 level ups this season',
  'error.playerMaxLevel': 'Player already reached the maximum level',
  'error.cardMaxLevel70': 'Action card only allows level ups until level 70',
  'error.cardMaxLevel40': 'Action card only allows level ups until level 40',
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
  'log.sellOfferCreated': 'You added a sell offer for {playerName} at {price}.',

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

  // Log messages - Youth players
  'log.youthPlayerPromoted': '{playerName} has been promoted to the A Team at level {level}!',
  'log.youthPlayerFired': 'Youth player {playerName} has been released from the youth team.',
  'log.youthPlayerAt18Warning': 'Warning: Youth player {playerName} will be automatically released next season if not promoted!',

  // Log messages - Cards and suspensions
  'log.playerYellowCard': '{playerName} received a yellow card!',
  'log.playerRedCard': '{playerName} received a red card!',
  'log.playerFiveYellows': '{playerName} has accumulated 5 yellow cards!',
  'log.playerSuspended': '{playerName} is suspended and will miss the next match.',
  'log.playerRemovedFromLineup': '{playerName} was automatically removed from the lineup due to suspension.',
  'log.playerAt4Yellows': 'Warning: {playerName} has 4 yellow cards. One more and they will be suspended!',

  // Finance reasons
  'finance.playerSalaries': 'Player salaries',
  'finance.ticketRevenue': 'Ticket revenue',
  'finance.stadiumTicketEarnings': 'Stadium ticket earnings',
  'finance.sponsorPayment': 'Sponsor payment',
  'finance.sponsorDeal': 'Sponsor deal with {name}',
  'finance.stadiumConstruction': 'Stadium construction started',
  'finance.playerSold': 'Player sold: {playerName}',
  'finance.playerBought': 'Player bought: {playerName}',
  'finance.stadiumExpansion': 'Stadium expansion: {stand}',
  'finance.roofConstruction': 'Roof construction: {stand}',
  'finance.friendlyMatchTickets': 'Friendly match ticket earnings',
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
  'news.newSeason': 'Season {season} has started!',

  // News templates - Transfer
  'news.transfer.1.title': 'Record Transfer: {playerName} joins {toTeam} for {price}',
  'news.transfer.1.text': 'In a stunning move, {playerName} has completed a transfer from {fromTeam} to {toTeam} for {price}. This marks the most expensive transfer of the day in the league.',
  'news.transfer.2.title': '{playerName} Makes Big Money Move to {toTeam}',
  'news.transfer.2.text': '{toTeam} has secured the services of {playerName} from {fromTeam} for a hefty sum of {price}. The transfer is expected to strengthen their squad significantly.',
  'news.transfer.3.title': '{toTeam} Splashes {price} on {playerName}',
  'news.transfer.3.text': 'In the biggest deal of the day, {toTeam} has acquired {playerName} from {fromTeam} for {price}. Fans are excited to see what the new signing will bring to the team.',
  'news.transfer.4.title': 'Breaking: {playerName} Completes Move to {toTeam}',
  'news.transfer.4.text': 'The transfer saga is over! {playerName} has officially joined {toTeam} from {fromTeam} for {price}. The signing could prove decisive in the title race.',
  'news.transfer.5.title': '{toTeam} Secures Signature of {playerName}',
  'news.transfer.5.text': 'After days of negotiations, {toTeam} has finally landed {playerName} from {fromTeam}. The {price} deal represents a statement of intent from the club.',

  // News templates - Highest Win
  'news.highestWin.1.title': '{teamName} Dominates with {goalDiff}-Goal Victory',
  'news.highestWin.1.text': '{teamName} delivered a commanding performance, crushing their opponents {goalsFor}-{goalsAgainst}. This was the biggest win of the game day in the league.',
  'news.highestWin.2.title': 'Crushing Victory: {teamName} Wins {goalsFor}-{goalsAgainst}',
  'news.highestWin.2.text': '{teamName} put on a clinical display, dismantling their opponents with a {goalDiff}-goal margin. The result sends a strong message to the rest of the league.',
  'news.highestWin.3.title': '{teamName} Runs Riot in {goalDiff}-Goal Thrashing',
  'news.highestWin.3.text': 'It was a day to remember for {teamName} as they recorded a stunning {goalsFor}-{goalsAgainst} victory. The convincing win demonstrates their title credentials.',
  'news.highestWin.4.title': 'Demolition Job: {teamName} Cruises to {goalsFor}-{goalsAgainst} Win',
  'news.highestWin.4.text': '{teamName} showed no mercy in a devastating {goalDiff}-goal victory. Their attacking prowess was on full display as they swept aside all opposition.',
  'news.highestWin.5.title': '{teamName} Delivers Statement Win',
  'news.highestWin.5.text': 'What a performance! {teamName} obliterated their rivals {goalsFor}-{goalsAgainst} in what can only be described as a masterclass. The {goalDiff}-goal margin tells the whole story.',

  // News templates - Position First
  'news.positionFirst.1.title': '{teamName} Claims Top Spot!',
  'news.positionFirst.1.text': '{teamName} has risen to the top of the league table after an impressive run of form. Can they maintain their position at the summit?',
  'news.positionFirst.2.title': 'New Leaders: {teamName} Takes First Place',
  'news.positionFirst.2.text': '{teamName} has climbed to the top of the standings. The team will be looking to consolidate their position in the coming weeks.',
  'news.positionFirst.3.title': '{teamName} Moves Into First Place',
  'news.positionFirst.3.text': 'After another strong performance, {teamName} now sits at the top of the table. Their recent form has been nothing short of exceptional.',
  'news.positionFirst.4.title': '{teamName} Takes Over at the Top',
  'news.positionFirst.4.text': 'The league has a new leader! {teamName} has overtaken the competition and now occupies first place. The title race is heating up.',
  'news.positionFirst.5.title': 'Top of the League: {teamName} Leads the Way',
  'news.positionFirst.5.text': '{teamName} has done it! They are now the frontrunners in the championship race. Their consistency has finally paid off with a move to first place.',

  // News templates - Position Last
  'news.positionLast.1.title': 'Relegation Fears Grow for {teamName}',
  'news.positionLast.1.text': '{teamName} has dropped to the bottom of the table. With relegation looming, the pressure is on to turn things around quickly.',
  'news.positionLast.2.title': '{teamName} Falls to Last Place',
  'news.positionLast.2.text': 'Troubling times for {teamName} as they find themselves at the foot of the table. The team must find form soon to avoid the drop.',
  'news.positionLast.3.title': 'Bottom of the Table: {teamName} in Crisis',
  'news.positionLast.3.text': '{teamName} is now in the relegation zone after slipping to last place. The management will need to act fast to save their season.',
  'news.positionLast.4.title': '{teamName} Sinks to the Bottom',
  'news.positionLast.4.text': 'Dark days for {teamName} as they hit rock bottom in the league standings. A dramatic turnaround is needed to avoid relegation.',
  'news.positionLast.5.title': 'Crisis at {teamName}: Last Place in the League',
  'news.positionLast.5.text': 'The alarm bells are ringing at {teamName}. Now sitting in last place, the club faces a real battle to secure their top-flight status.',

  // News templates - Stadium Extension
  'news.stadiumExtension.1.title': '{teamName} Expands Stadium',
  'news.stadiumExtension.1.text': '{teamName} has invested in their future by expanding their stadium. The increased capacity will help attract more fans and generate additional revenue.',
  'news.stadiumExtension.2.title': 'New Stadium Works at {teamName}',
  'news.stadiumExtension.2.text': '{teamName} has begun major stadium improvements. The expansion shows the club\'s ambition to grow both on and off the pitch.',
  'news.stadiumExtension.3.title': '{teamName} Invests in Stadium Upgrade',
  'news.stadiumExtension.3.text': 'Big news from {teamName} as they announce stadium expansion plans. The improvements will enhance the matchday experience for supporters.',
  'news.stadiumExtension.4.title': 'Construction Begins at {teamName}\'s Stadium',
  'news.stadiumExtension.4.text': 'The cranes are in and work has started on {teamName}\'s stadium expansion. Fans can look forward to improved facilities in the near future.',
  'news.stadiumExtension.5.title': '{teamName} Embarks on Stadium Development',
  'news.stadiumExtension.5.text': '{teamName} is building for the future with a significant stadium expansion project. The investment reflects the club\'s growing ambitions.',

  // News templates - Level Up
  'news.levelUp.1.title': '{playerName} Reaches New Heights at {teamName}',
  'news.levelUp.1.text': '{playerName} has leveled up to level {newLevel}, showcasing their continued development at {teamName}. The player is becoming a key asset for the team.',
  'news.levelUp.2.title': '{playerName} Levels Up to {newLevel}',
  'news.levelUp.2.text': 'Great news for {teamName} as {playerName} has improved to level {newLevel}. The player\'s hard work in training is paying off.',
  'news.levelUp.3.title': 'Rising Star: {playerName} Hits Level {newLevel}',
  'news.levelUp.3.text': '{teamName}\'s {playerName} continues to impress, reaching level {newLevel}. The improvement makes them an even more valuable member of the squad.',
  'news.levelUp.4.title': '{playerName} Breaks Through to Level {newLevel}',
  'news.levelUp.4.text': 'What a milestone for {playerName}! The {teamName} star has reached level {newLevel}, cementing their place as one of the league\'s top talents.',
  'news.levelUp.5.title': '{teamName}\'s {playerName} Achieves Level {newLevel}',
  'news.levelUp.5.text': 'The development continues! {playerName} has progressed to level {newLevel}, a testament to their dedication and {teamName}\'s excellent coaching staff.',

  // Cup log messages
  'log.cupMatchWin': 'Cup victory! You beat {opponent} {goalsFor}-{goalsAgainst}!',
  'log.cupMatchLoss': 'Cup elimination. Lost {goalsFor}-{goalsAgainst} to {opponent}.',
  'log.cupMatchDraw': 'Cup draw against {opponent} {goalsFor}-{goalsAgainst}. Decided on penalties.',
  'log.cupWinner': 'Congratulations! You won the Cup! Prize: {prize}',

  // Cup finance
  'finance.cupPrize': 'Cup winner prize',

  // Building errors
  'error.buildingNotFound': 'Building not found',
  'error.buildingUnderConstruction': 'Building is already under construction',
  'error.buildingMaxLevel': 'Building is already at maximum level',

  // Building log messages
  'log.buildingUpgradeStarted': 'Construction started: Upgrading {buildingName}!',
  'log.buildingUpgradeComplete': 'Construction complete: {buildingName} has been upgraded!',

  // Building names
  'building.trainingArea': 'Training Area',

  // Building finance
  'finance.buildingUpgrade': 'Building upgrade'
}
