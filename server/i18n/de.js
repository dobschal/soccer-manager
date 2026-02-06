export default {
  // Auth errors
  'error.usernameString': 'Benutzername muss ein Text sein',
  'error.passwordString': 'Passwort muss ein Text sein',
  'error.passwordLength': 'Passwort muss ein Text mit mehr als 8 Zeichen sein',
  'error.usernameTaken': 'Benutzername bereits vergeben',
  'error.noTeamAvailable': 'Kein Team verfügbar.',
  'error.wrongCredentials': 'Falsche Anmeldedaten',
  'error.notAuthorized': 'Nicht autorisiert',
  'error.invalidLanguage': 'Ungültige Sprache',

  // Trade errors
  'error.playerNotFound': 'Spieler nicht gefunden',
  'error.playerNotOnMarket': 'Spieler ist nicht auf dem Markt',
  'error.cannotBuyOwnPlayer': 'Du kannst keinen eigenen Spieler kaufen',
  'error.notEnoughMoney': 'Nicht genug Geld',
  'error.offerNotFound': 'Angebot nicht gefunden',
  'error.notYourOffer': 'Das ist nicht dein Angebot',
  'error.notYourPlayer': 'Das ist nicht dein Spieler',
  'error.playerAlreadyListed': 'Spieler ist bereits gelistet',
  'error.invalidOfferValue': 'Ungültiger Angebotswert',
  'error.offerTooLow': 'Angebot ist zu niedrig',

  // Stadium errors
  'error.standNotFound': 'Tribüne nicht gefunden',
  'error.standUnderConstruction': 'Diese Tribüne wird bereits gebaut',
  'error.standAlreadyHasRoof': 'Diese Tribüne hat bereits ein Dach',
  'error.cannotExpandFurther': 'Kann nicht weiter erweitert werden',
  'error.invalidTicketPrice': 'Ungültiger Ticketpreis',

  // Player errors
  'error.invalidPosition': 'Ungültige Position',
  'error.positionAlreadyTaken': 'Position ist bereits besetzt',
  'error.playerNotInTeam': 'Spieler ist nicht in deinem Team',

  // Action card errors
  'error.cardNotFound': 'Aktionskarte nicht gefunden',
  'error.cardAlreadyPlayed': 'Diese Karte wurde bereits gespielt',
  'error.cannotMergeCards': 'Diese Karten können nicht verschmolzen werden',
  'error.notEnoughCards': 'Nicht genug Karten zum Verschmelzen',
  'error.invalidCardAction': 'Ungültige Kartenaktion',
  'error.playerMaxLevelUps': 'Spieler hat bereits 2 Level-Ups in dieser Saison erhalten',
  'error.playerMaxLevel': 'Spieler hat bereits das maximale Level erreicht',
  'error.cardMaxLevel7': 'Aktionskarte erlaubt nur Level-Ups bis Level 7',
  'error.cardMaxLevel4': 'Aktionskarte erlaubt nur Level-Ups bis Level 4',
  'error.goalkeeperCannotChange': 'Torhüter können ihre Position nicht wechseln',
  'error.cannotBecomeGoalkeeper': 'Spieler können nicht zu Torhütern werden',

  // Generic errors
  'error.invalidRequest': 'Ungültige Anfrage',
  'error.serverError': 'Serverfehler',

  // Log messages - Welcome
  'log.welcome': 'Hey {username}! Der Präsident von {teamName} heißt dich herzlich willkommen!',

  // Log messages - Lineup warnings
  'log.incompleteLineup': 'Warnung: Deine Aufstellung hat nur {count} Spieler! Du brauchst 11 Spieler für optimale Leistung.',
  'log.lowFreshness': 'Warnung: {playerName} hat niedrige Frische ({freshness}%). Erwäge eine Pause.',

  // Log messages - Trades
  'log.playerSold': '{playerName} wurde an {buyerTeam} für {price} verkauft!',
  'log.playerBought': '{playerName} wurde von {sellerTeam} für {price} gekauft!',
  'log.offerReceived': 'Du hast ein Angebot von {price} für {playerName} von {fromTeam} erhalten.',
  'log.offerAccepted': 'Dein Angebot für {playerName} wurde angenommen!',
  'log.offerRejected': 'Dein Angebot für {playerName} wurde abgelehnt.',

  // Log messages - Action cards
  'log.cardLevelUp': '{playerName} ist auf Level {level} aufgestiegen!',
  'log.cardFreshness': '{playerName}s Frische wurde auf 100% wiederhergestellt!',
  'log.cardMoney': 'Du hast einen Bonus von {amount} erhalten!',
  'log.cardYouth': 'Ein neues Nachwuchstalent {playerName} ist deinem Team beigetreten!',
  'log.cardsMerged': 'Karten wurden zu einer mächtigeren Karte verschmolzen!',

  // Log messages - Stadium
  'log.stadiumExpansionStarted': 'Bau begonnen: {stand} Erweiterung auf {newSize} Plätze.',
  'log.stadiumExpansionComplete': 'Bau abgeschlossen: {stand} hat jetzt {newSize} Plätze!',
  'log.roofConstructionStarted': 'Bau begonnen: Dach für {stand}.',
  'log.roofConstructionComplete': 'Bau abgeschlossen: {stand} hat jetzt ein Dach!',

  // Log messages - Season
  'log.seasonEnd': 'Saison {season} ist beendet!',
  'log.promoted': 'Herzlichen Glückwunsch! Du bist in Liga {league} aufgestiegen!',
  'log.relegated': 'Leider bist du in Liga {league} abgestiegen.',
  'log.champion': 'Du bist Meister der Liga {league}!',

  // Log messages - Match
  'log.matchWin': 'Sieg! Du hast {goalsFor}:{goalsAgainst} gegen {opponent} gewonnen!',
  'log.matchDraw': 'Unentschieden! {goalsFor}:{goalsAgainst} gegen {opponent}.',
  'log.matchLoss': 'Niederlage. Du hast {goalsFor}:{goalsAgainst} gegen {opponent} verloren.',

  // Log messages - Player career
  'log.playerRetired': '{playerName} hat seine Profikarriere beendet.',
  'log.playerInjured': '{playerName} ist verletzt und wird das nächste Spiel verpassen.',
  'log.playerFired': 'Du hast deinen Spieler {playerName} entlassen.',
  'log.playerSigned': 'Glückwunsch! Du hast einen neuen Spielervertrag mit {playerName} unterschrieben.',

  // Finance reasons
  'finance.playerSalaries': 'Spielergehälter',
  'finance.ticketRevenue': 'Ticketeinnahmen',
  'finance.sponsorPayment': 'Sponsorzahlung',
  'finance.playerSold': 'Spieler verkauft: {playerName}',
  'finance.playerBought': 'Spieler gekauft: {playerName}',
  'finance.stadiumExpansion': 'Stadionerweiterung: {stand}',
  'finance.roofConstruction': 'Dachbau: {stand}',
  'finance.actionCardBonus': 'Aktionskarten-Bonus',
  'finance.leagueBonus': 'Liga-Bonus',
  'finance.promotionBonus': 'Aufstiegsbonus',
  'finance.startingBalance': 'Startguthaben',

  // News headlines
  'news.topScorer': 'Torschützenkönig: {playerName} ({goals} Tore)',
  'news.bestTeam': 'Bestes Team: {teamName}',
  'news.worstTeam': 'In Schwierigkeiten: {teamName}',
  'news.bigWin': 'Dominanter Sieg: {team1} {score} {team2}',
  'news.upset': 'Überraschung! {team1} besiegt {team2}',
  'news.promotion': '{teamName} in Liga {league} aufgestiegen',
  'news.relegation': '{teamName} in Liga {league} abgestiegen',
  'news.champion': '{teamName} gewinnt die Meisterschaft der Liga {league}!',
  'news.newSeason': 'Saison {season} hat begonnen!'
}
