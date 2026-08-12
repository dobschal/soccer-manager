export default {
  // Auth errors
  'error.usernameString': 'Username needs to be string',
  'error.passwordString': 'Password needs to be string',
  'error.passwordLength': 'Password needs to be string longer than 8 characters',
  'error.usernameTaken': 'Username already taken',
  'error.noTeamAvailable': 'No team available.',
  'error.wrongCredentials': 'Wrong credentials',
  'error.wrongOldPassword': 'The current password is incorrect',
  'error.notAuthorized': 'Not authorized',
  'error.invalidLanguage': 'Invalid language',
  'error.emailInvalid': 'Please enter a valid email address',
  'error.emailTaken': 'This email address is already in use',
  'error.emailRequired': 'Email is required',
  'error.emailBlocked': 'This email address cannot be used',
  'error.accountBlocked': 'This account has been blocked. Please contact support.',
  'error.verificationTokenInvalid': 'This verification link is invalid or has expired',
  'error.passwordResetTokenInvalid': 'This password reset link is invalid or has expired',
  'error.invalidParam': 'Invalid parameter',
  'error.referralSelfInvite': 'You cannot invite yourself',
  'error.referralAlreadyMember': 'This email already belongs to a FootballManager.IO user',
  'error.referralLimitReached': 'You have too many pending invitations — wait for some to be accepted',

  // Team choice
  'chooseTeam.alreadyHasTeam': 'You already manage a team.',
  'chooseTeam.teamUnavailable': 'This team is not available anymore.',

  // Verification email content
  'email.verify.subject': 'Confirm your email address',
  'email.verify.greeting': 'Hi {username},',
  'email.verify.body': 'Welcome to FootballManager.IO! Please confirm your email address so we can use it for password recovery and important account notifications. Your email will not be shared with third parties.',
  'email.verify.button': 'Confirm email',
  'email.verify.fallbackLink': 'If the button does not work, copy and paste this URL into your browser:',

  // Password reset email content
  'email.passwordReset.subject': 'Reset your password',
  'email.passwordReset.greeting': 'Hi {username},',
  'email.passwordReset.body': 'We received a request to reset the password for your FootballManager.IO account. Click the button below to choose a new password. This link is valid for 2 hours.',
  'email.passwordReset.button': 'Reset password',
  'email.passwordReset.fallbackLink': 'If the button does not work, copy and paste this URL into your browser:',
  'email.passwordReset.ignoreHint': 'If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.',

  'email.footer.privacy': 'Privacy',
  'email.footer.support': 'Support',
  'email.footer.app': 'Open app',

  // Inactivity warning email content
  'email.inactivityWarning.subject': 'Your FootballManager.IO account will be deleted in {daysRemaining} day(s)',
  'email.inactivityWarning.body': 'Hi {username},\n\nyou have not logged into FootballManager.IO in a while. Your account is scheduled to be deleted automatically in {daysRemaining} day(s) so the team can be reassigned to another manager.\n\nIf you would like to keep playing, just log back in within the next {daysRemaining} day(s) and your account will stay active.',
  'email.inactivityWarning.button': 'Log back in',

  // Admin message email content
  'email.adminMessage.subject': 'A message from FootballManager.IO',
  'email.adminMessage.greeting': 'Hey {username},',
  'email.adminMessage.button': 'Open FootballManager.IO',
  'email.adminMessage.signature': 'Your FootballManager.IO team',

  // Referral invitation email content
  'email.referral.subject': '{inviter} has invited you to FootballManager.IO',
  'email.referral.greeting': 'Hi there,',
  'email.referral.body': '{inviter} has invited you to FootballManager.IO — a free football manager game where you build your team, climb the leagues and outsmart other coaches. Play in your browser or grab the iOS and Android app. Create your free account and start playing now.',
  'email.referral.button': 'Play now',
  'email.referral.signature': 'See you on the pitch,\nThe FootballManager.IO team',

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
  'error.sellPriceTooLow': 'The asking price must be at least 75% of the player\'s market value ({minPrice}).',
  'error.buyPriceTooLow': 'Your offer must be at least 75% of the player\'s market value ({minPrice}).',
  'error.offerTooLow': 'Offer is too low',
  'error.offerLimitReached': 'You can only make 3 offers per player per game day',
  'error.sellOfferLimitReached': 'You can list at most {max} players on the transfer market at the same time.',
  'error.instantBuyDisabled': 'The seller disabled instant buy for this player',
  'error.playerAlreadyTransferredThisSeason': 'This player has already changed clubs twice this season',
  'error.freeAgentSellLock': 'Players just signed from the free market cannot be sold in the same season.',

  // Stadium errors
  'error.standNotFound': 'Stand not found',
  'error.standUnderConstruction': 'This stand is already under construction',
  'error.standAlreadyHasRoof': 'This stand already has a roof',
  'error.cannotExpandFurther': 'Cannot expand further',
  'error.invalidTicketPrice': 'Invalid ticket price',
  'error.invalidStadiumName': 'Stadium name must be 1-100 characters long',

  // Player errors
  'error.teamTooSmall': 'Your team must have at least 14 players.',
  'error.teamTooLarge': 'Your team cannot have more than 42 players.',
  'error.invalidPosition': 'Invalid position',
  'error.positionAlreadyTaken': 'Position is already taken',
  'error.playerNotInTeam': 'Player is not in your team',

  // Youth player errors
  'error.youthPlayerNotFound': 'Youth player not found',
  'error.notYourYouthPlayer': 'This is not your youth player',
  'error.youthPlayerTooYoung': 'Youth player must be at least 16 years old to be promoted',
  'error.youthInvalidTrainingMode': 'Invalid training mode',
  'error.youthModeSlotsFull': 'No free slots for this mode. Upgrade your youth academy or reassign another player.',

  // Action card errors
  'error.cardNotFound': 'Action card not found',
  'error.cardAlreadyPlayed': 'This card has already been played',
  'error.cannotMergeCards': 'Cannot merge these cards',
  'error.notEnoughCards': 'Not enough cards to merge',
  'error.invalidCardAction': 'Invalid card action',
  'error.actionCardLimitReached': 'You already hold the maximum of {max} cards of this type. Use some before claiming more.',
  'error.tooManyCardOffers': 'You already have {max} open card offers. Cancel one before creating another.',
  'error.cannotBidOwnOffer': 'You cannot bid on your own offer.',
  'error.emptyBid': 'A bid must include money or at least one card.',
  'error.bidderCannotAfford': 'The bidder can no longer afford this bid.',
  'error.chatInvalidUser': 'Invalid chat recipient',
  'error.chatEmptyMessage': 'A message must contain text or an image',
  'chat.imageMessage': '📷 Photo',
  'chat.voiceMessage': '🎤 Voice message',
  'error.playerMaxLevelUps': 'Player already got 20 level ups this season',
  'error.playerMaxLevel': 'Player already reached the maximum level',
  'error.cardMaxLevel70': 'Action card only allows level ups until level 70',
  'error.cardMaxLevel40': 'Action card only allows level ups until level 40',
  'error.alreadyStarPlayer': 'This player is already a star player.',
  'error.playerNotInjured': 'This player is not injured.',
  'error.motivatingSpeechAlreadyActive': 'Motivating speech is already active for this game day.',

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
  'log.cardBidReceived': '{team} placed a bid on one of your action-card offers.',
  'log.botCardBidComment': 'Automatic offer for a card that has been listed for over 24 hours.',
  'log.cardTradeSold': 'Your action-card trade with {team} was completed.',
  'log.cardTradeBought': 'Your bid was accepted — you traded action cards with {team}.',
  'log.cardOfferDropped': 'One of your action-card offers was withdrawn because the listed cards are no longer available.',
  'log.cardBidDropped': 'One of your bids was withdrawn because the cards you staked are no longer available.',
  'log.offerRejected': 'Your offer for {playerName} has been rejected.',
  'log.sellOfferCreated': 'You added a sell offer for {playerName} at {price}.',
  'log.sellOffersRemoved': '{count} of your sell offers were removed. You can list at most {max} players on the transfer market at the same time.',

  // Log messages - Action cards
  'log.cardLevelUp': '{playerName} has leveled up to level {level}!',
  'log.cardFreshness': '{playerName}\'s freshness has been restored to 100%!',
  'log.cardMoney': 'You received a bonus of {amount}!',
  'log.cardYouth': 'A new youth talent {playerName} has joined your team!',
  'log.cardsMerged': 'Cards have been merged into a more powerful card!',
  'log.cardStarPlayer': '{playerName} has been promoted to Star Player!',
  'log.cardMotivatingSpeech': 'Your team is fired up! +10% strength for the next game day!',
  'log.cardMedicalTreatment': '{playerName} was treated at the medical practice — {days} game day(s) left instead of one more.',
  'log.cardMedicalTreatmentHealed': '{playerName} was treated at the medical practice and is available again!',

  // Log messages - Stadium
  'log.stadiumExpansionStarted': 'Construction started: {stand} expansion to {newSize} seats.',
  'log.stadiumExpansionComplete': 'Construction complete: {stand} now has {newSize} seats!',
  'log.roofConstructionStarted': 'Construction started: Roof for {stand}.',
  'log.roofConstructionComplete': 'Construction complete: {stand} now has a roof!',
  'stand.north': 'north stand',
  'stand.south': 'south stand',
  'stand.east': 'east stand',
  'stand.west': 'west stand',
  'stand.corner_ne': 'NE corner stand',
  'stand.corner_nw': 'NW corner stand',
  'stand.corner_se': 'SE corner stand',
  'stand.corner_sw': 'SW corner stand',

  // Injury types
  'injury.bruise': 'Bruise',
  'injury.muscle_strain': 'Muscle Strain',
  'injury.ligament_sprain': 'Ligament Sprain',
  'injury.muscle_tear': 'Muscle Tear',
  'injury.fracture': 'Fracture',
  'injury.meniscus_tear': 'Meniscus Tear',
  'injury.acl_tear': 'ACL Tear',
  'injury.achilles_rupture': 'Achilles Tendon Rupture',

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
  'log.playerInjured': '{playerName} is injured: {injuryType}! Out for {days} game day(s).',
  'log.playerSubstitutedInjury': '{playerOutName} was substituted due to injury by {playerInName}.',
  'log.playerSubstitutedFreshness': '{playerOutName} was substituted due to low fitness by {playerInName}.',
  'log.playerRecovered': '{playerName} has recovered and is available again.',
  'log.playerFired': 'You fired your player {playerName}.',
  'log.playerSigned': 'Congratulations! You signed a new player contract with {playerName}.',

  // Log messages - Youth players
  'log.youthPlayerPromoted': '{playerName} has been promoted to the A Team at level {level}!',
  'log.youthPlayerFired': 'Youth player {playerName} has been released from the youth team.',
  'log.youthPlayerSold': 'Youth player {playerName} was sold for {value}€.',
  'log.tourCompleted': 'Your squad is back from the {tour} — {count} new action card(s) are waiting for you.',
  'tour.south_america': 'South America tour',
  'tour.asia': 'Asia tour',
  'tour.europe': 'Europe tour',
  'log.youthPlayerAt18Warning': 'Warning: The following youth players will be automatically released next season if not promoted: {playerNames}',

  // Log messages - Cards and suspensions
  'log.playerYellowCard': '{playerName} received a yellow card!',
  'log.playerRedCard': '{playerName} received a red card!',
  'log.playerFiveYellows': '{playerName} has accumulated 5 yellow cards!',
  'log.playerSuspended': '{playerName} is suspended and will miss the next match.',
  'log.playerRemovedFromLineup': '{playerName} was automatically removed from the lineup due to suspension.',
  'log.lineupAutoFilled': 'Your lineup was incomplete. {playerName} was automatically assigned to {position}.',

  // Finance reasons
  'finance.playerSalaries': 'Player salaries',
  'finance.ticketRevenue': 'Ticket revenue',
  'finance.stadiumTicketEarnings': 'Stadium ticket earnings',
  'finance.sponsorPayment': 'Sponsor payment',
  'finance.sponsorDeal': 'Sponsor deal with {name}',
  'finance.stadiumConstruction': 'Stadium construction started',
  'finance.playerSold': 'Player sold: {playerName}',
  'finance.youthPlayerSold': 'Youth player sold: {playerName}',
  'finance.playerBought': 'Player bought: {playerName}',
  'finance.cardSold': 'Action card sold on the marketplace',
  'finance.cardBought': 'Action card bought on the marketplace',
  'finance.stadiumExpansion': 'Stadium expansion: {stand}',
  'finance.roofConstruction': 'Roof construction: {stand}',
  'finance.friendlyMatchTickets': 'Friendly match ticket earnings',
  'finance.actionCardBonus': 'Action card bonus',
  'finance.leagueBonus': 'League bonus',
  'finance.promotionBonus': 'Promotion bonus',
  'finance.startingBalance': 'Starting balance',
  'finance.adminAdjustment': 'Balance adjusted by an admin',
  'finance.tvMoney': 'TV money (rank {rank}, league level {level})',

  // Match day recap
  'recap.title': 'Matchday {matchDay} Recap',
  'recap.intro.highScoring': 'What a matchday! {gameCount} matches produced {totalGoals} goals — a real treat for the fans.',
  'recap.intro.lowScoring': 'A defensive matchday: only {totalGoals} goals were scored across {gameCount} matches.',
  'recap.intro.balanced': 'Matchday {matchDay} delivered {totalGoals} goals across {gameCount} matches with plenty of drama.',
  'recap.biggestWin': 'The biggest win of the day belonged to {winnerName}, who beat {loserName} {goalsFor}:{goalsAgainst}.',
  'recap.topScorer.one': '{playerName} ({teamName}) was the man of the day with 1 goal.',
  'recap.topScorer.many': '{playerName} ({teamName}) was unstoppable, netting {goals} goals.',
  'recap.upset': 'The upset of the day saw {winnerName} (place {winnerPlace}) topple league favourite {loserName} (place {loserPlace}).',
  'recap.redCards.one': 'Tempers boiled over: 1 red card was shown in the league.',
  'recap.redCards.many': 'Tempers boiled over: {count} red cards were shown across the league.',
  'recap.injuries.one': '1 player picked up an injury and will miss upcoming matches.',
  'recap.injuries.many': '{count} players picked up injuries and will miss upcoming matches.',
  'recap.draws.one': '1 of the matches ended in a draw.',
  'recap.draws.many': '{count} of the matches ended in a draw.',
  'recap.outro.predictable': 'The standings barely moved as the form guide held firm.',
  'recap.outro.shaken': 'Several results have shaken up the table — the next matchday promises to be intense.',

  // Cup log messages
  'log.cupMatchWin': 'Cup victory! You beat {opponent} {goalsFor}-{goalsAgainst}! Prize: {prize}',
  'log.cupMatchLoss': 'Cup elimination. Lost {goalsFor}-{goalsAgainst} to {opponent}.',
  'log.cupMatchWinExtraTime': 'Cup victory after extra time! You beat {opponent} {goalsFor}-{goalsAgainst} (a.e.t.)! Prize: {prize}',
  'log.cupMatchLossExtraTime': 'Cup elimination after extra time. Lost {goalsFor}-{goalsAgainst} (a.e.t.) to {opponent}.',
  'log.cupMatchWinPenalties': 'Cup victory on penalties! You beat {opponent} {penaltiesFor}-{penaltiesAgainst} on pens (after extra time: {goalsFor}-{goalsAgainst}). Prize: {prize}',
  'log.cupMatchLossPenalties': 'Cup elimination on penalties. Lost {penaltiesFor}-{penaltiesAgainst} on pens to {opponent} (after extra time: {goalsFor}-{goalsAgainst}).',
  'log.cupMatchDraw': 'Cup draw against {opponent} {goalsFor}-{goalsAgainst}.',
  'log.cupWinner': 'Congratulations! You won the Cup! Prize: {prize}',

  // Cup finance
  'finance.cupPrize': 'Cup winner prize',
  'finance.cupRoundPrize': 'Cup round prize',

  // Building errors
  'error.buildingNotFound': 'Building not found',
  'error.buildingUnderConstruction': 'Building is already under construction',
  'error.buildingMaxLevel': 'Building is already at maximum level',

  // Building log messages
  'log.buildingUpgradeStarted': 'Construction started: Upgrading {buildingName}!',
  'log.buildingUpgradeComplete': 'Construction complete: {buildingName} has been upgraded!',

  // Building names
  'building.trainingArea': 'Training Area',
  'building.fitnessStudio': 'Fitness Studio',
  'building.youthAcademy': 'Youth Academy',
  'building.medicalPractice': 'Medical Practice',

  // Building finance
  'finance.buildingUpgrade': 'Building upgrade',

  // World Cup
  'worldCup.bettingClosed': 'Betting is closed for this game.'
}
