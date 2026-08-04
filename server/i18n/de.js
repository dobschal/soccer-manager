export default {
  // Auth errors
  'error.usernameString': 'Benutzername muss ein Text sein',
  'error.passwordString': 'Passwort muss ein Text sein',
  'error.passwordLength': 'Passwort muss ein Text mit mehr als 8 Zeichen sein',
  'error.usernameTaken': 'Benutzername bereits vergeben',
  'error.noTeamAvailable': 'Kein Team verfügbar.',
  'error.wrongCredentials': 'Falsche Anmeldedaten',
  'error.wrongOldPassword': 'Das aktuelle Passwort ist falsch',
  'error.notAuthorized': 'Nicht autorisiert',
  'error.invalidLanguage': 'Ungültige Sprache',
  'error.emailInvalid': 'Bitte gib eine gültige E-Mail-Adresse ein',
  'error.emailTaken': 'Diese E-Mail-Adresse wird bereits verwendet',
  'error.emailRequired': 'E-Mail-Adresse ist erforderlich',
  'error.verificationTokenInvalid': 'Dieser Bestätigungslink ist ungültig oder abgelaufen',
  'error.passwordResetTokenInvalid': 'Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen',
  'error.invalidParam': 'Ungültiger Parameter',
  'error.referralSelfInvite': 'Du kannst dich nicht selbst einladen',
  'error.referralAlreadyMember': 'Diese E-Mail-Adresse gehört bereits zu einem FootballManager.IO-Spieler',
  'error.referralLimitReached': 'Du hast zu viele offene Einladungen — warte, bis einige angenommen wurden',

  // Vereinswahl
  'chooseTeam.alreadyHasTeam': 'Du betreust bereits ein Team.',
  'chooseTeam.teamUnavailable': 'Dieses Team ist nicht mehr verfügbar.',

  // Verification email content
  'email.verify.subject': 'Bestätige deine E-Mail-Adresse',
  'email.verify.greeting': 'Hi {username},',
  'email.verify.body': 'Willkommen bei FootballManager.IO! Bitte bestätige deine E-Mail-Adresse, damit wir sie für das Zurücksetzen deines Passworts und wichtige Account-Benachrichtigungen verwenden können. Deine E-Mail wird nicht an Dritte weitergegeben.',
  'email.verify.button': 'E-Mail bestätigen',
  'email.verify.fallbackLink': 'Falls der Button nicht funktioniert, kopiere diese URL in deinen Browser:',

  // Password reset email content
  'email.passwordReset.subject': 'Setze dein Passwort zurück',
  'email.passwordReset.greeting': 'Hi {username},',
  'email.passwordReset.body': 'Wir haben eine Anfrage erhalten, das Passwort für deinen FootballManager.IO-Account zurückzusetzen. Klicke auf den Button unten, um ein neues Passwort zu wählen. Dieser Link ist 2 Stunden gültig.',
  'email.passwordReset.button': 'Passwort zurücksetzen',
  'email.passwordReset.fallbackLink': 'Falls der Button nicht funktioniert, kopiere diese URL in deinen Browser:',
  'email.passwordReset.ignoreHint': 'Falls du keinen Passwort-Reset angefordert hast, kannst du diese E-Mail ignorieren — dein Passwort bleibt unverändert.',

  'email.footer.privacy': 'Datenschutz',
  'email.footer.support': 'Support',
  'email.footer.app': 'App öffnen',

  // Inactivity warning email content
  'email.inactivityWarning.subject': 'Dein FootballManager.IO-Account wird in {daysRemaining} Tag(en) gelöscht',
  'email.inactivityWarning.body': 'Hallo {username},\n\ndu hast dich länger nicht mehr in FootballManager.IO eingeloggt. Dein Account wird in {daysRemaining} Tag(en) automatisch gelöscht, damit dein Team einem anderen Manager zugewiesen werden kann.\n\nWenn du weiterspielen möchtest, logge dich einfach innerhalb der nächsten {daysRemaining} Tag(e) wieder ein und dein Account bleibt aktiv.',
  'email.inactivityWarning.button': 'Jetzt einloggen',

  // Admin message email content
  'email.adminMessage.subject': 'Eine Nachricht von FootballManager.IO',
  'email.adminMessage.greeting': 'Hey {username},',
  'email.adminMessage.button': 'FootballManager.IO öffnen',
  'email.adminMessage.signature': 'Dein FootballManager.IO Team',

  // Referral invitation email content
  'email.referral.subject': '{inviter} hat dich zu FootballManager.IO eingeladen',
  'email.referral.greeting': 'Hallo!',
  'email.referral.body': '{inviter} hat dich zu FootballManager.IO eingeladen — einem kostenlosen Fußballmanager, in dem du dein Team aufbaust, dich durch die Ligen spielst und andere Trainer austrickst. Spiele im Browser oder hol dir die iOS- und Android-App. Erstelle deinen kostenlosen Account und spiele direkt mit.',
  'email.referral.button': 'Jetzt mitspielen',
  'email.referral.signature': 'Wir sehen uns auf dem Platz,\ndein FootballManager.IO Team',

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
  'error.sellPriceTooLow': 'Der Verkaufspreis muss mindestens 50% des Marktwerts des Spielers betragen ({minPrice}).',
  'error.offerTooLow': 'Angebot ist zu niedrig',
  'error.offerLimitReached': 'Du kannst nur 3 Angebote pro Spieler pro Spieltag abgeben',
  'error.sellOfferLimitReached': 'Du kannst höchstens {max} Spieler gleichzeitig auf dem Transfermarkt anbieten.',
  'error.instantBuyDisabled': 'Der Verkäufer hat den Sofortkauf für diesen Spieler deaktiviert',
  'error.playerAlreadyTransferredThisSeason': 'Dieser Spieler hat in dieser Saison bereits zweimal den Verein gewechselt',
  'error.freeAgentSellLock': 'Frisch vom freien Markt verpflichtete Spieler können in dieser Saison nicht verkauft werden.',

  // Stadium errors
  'error.standNotFound': 'Tribüne nicht gefunden',
  'error.standUnderConstruction': 'Diese Tribüne wird bereits gebaut',
  'error.standAlreadyHasRoof': 'Diese Tribüne hat bereits ein Dach',
  'error.cannotExpandFurther': 'Kann nicht weiter erweitert werden',
  'error.invalidTicketPrice': 'Ungültiger Ticketpreis',
  'error.invalidStadiumName': 'Stadionname muss 1-100 Zeichen lang sein',

  // Player errors
  'error.teamTooSmall': 'Dein Team muss mindestens 14 Spieler haben.',
  'error.teamTooLarge': 'Dein Team darf nicht mehr als 42 Spieler haben.',
  'error.invalidPosition': 'Ungültige Position',
  'error.positionAlreadyTaken': 'Position ist bereits besetzt',
  'error.playerNotInTeam': 'Spieler ist nicht in deinem Team',

  // Youth player errors
  'error.youthPlayerNotFound': 'Jugendspieler nicht gefunden',
  'error.notYourYouthPlayer': 'Das ist nicht dein Jugendspieler',
  'error.youthPlayerTooYoung': 'Jugendspieler muss mindestens 16 Jahre alt sein, um befördert zu werden',
  'error.youthInvalidTrainingMode': 'Ungültiger Trainingsmodus',
  'error.youthModeSlotsFull': 'Keine freien Slots für diesen Modus. Bau deine Jugendakademie weiter aus oder weise einen anderen Spieler um.',

  // Action card errors
  'error.cardNotFound': 'Aktionskarte nicht gefunden',
  'error.cardAlreadyPlayed': 'Diese Karte wurde bereits gespielt',
  'error.cannotMergeCards': 'Diese Karten können nicht verschmolzen werden',
  'error.notEnoughCards': 'Nicht genug Karten zum Verschmelzen',
  'error.invalidCardAction': 'Ungültige Kartenaktion',
  'error.actionCardLimitReached': 'Du besitzt bereits das Maximum von {max} Karten dieses Typs. Spiele einige aus, bevor du weitere einsammelst.',
  'error.tooManyCardOffers': 'Du hast bereits {max} offene Kartenangebote. Storniere eines, bevor du ein neues erstellst.',
  'error.cannotBidOwnOffer': 'Du kannst nicht auf dein eigenes Angebot bieten.',
  'error.emptyBid': 'Ein Gebot muss Geld oder mindestens eine Karte enthalten.',
  'error.bidderCannotAfford': 'Der Bieter kann sich dieses Gebot nicht mehr leisten.',
  'error.chatInvalidUser': 'Ungültiger Chat-Empfänger',
  'error.chatEmptyMessage': 'Eine Nachricht muss Text oder ein Bild enthalten',
  'chat.imageMessage': '📷 Foto',
  'error.playerMaxLevelUps': 'Spieler hat bereits 20 Level-Ups in dieser Saison erhalten',
  'error.playerMaxLevel': 'Spieler hat bereits das maximale Level erreicht',
  'error.cardMaxLevel70': 'Aktionskarte erlaubt nur Level-Ups bis Level 70',
  'error.cardMaxLevel40': 'Aktionskarte erlaubt nur Level-Ups bis Level 40',
  'error.alreadyStarPlayer': 'Dieser Spieler ist bereits ein Starspieler.',
  'error.motivatingSpeechAlreadyActive': 'Motivationsrede ist bereits für diesen Spieltag aktiv.',

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
  'log.cardBidReceived': '{team} hat auf eines deiner Aktionskarten-Angebote geboten.',
  'log.cardTradeSold': 'Dein Aktionskarten-Handel mit {team} wurde abgeschlossen.',
  'log.cardTradeBought': 'Dein Gebot wurde angenommen — du hast Aktionskarten mit {team} getauscht.',
  'log.sellOfferCreated': 'Du hast ein Verkaufsangebot für {playerName} zu {price} erstellt.',
  'log.sellOffersRemoved': '{count} deiner Verkaufsangebote wurden entfernt. Du kannst höchstens {max} Spieler gleichzeitig auf dem Transfermarkt anbieten.',

  // Log messages - Action cards
  'log.cardLevelUp': '{playerName} ist auf Level {level} aufgestiegen!',
  'log.cardFreshness': '{playerName}s Frische wurde auf 100% wiederhergestellt!',
  'log.cardMoney': 'Du hast einen Bonus von {amount} erhalten!',
  'log.cardYouth': 'Ein neues Nachwuchstalent {playerName} ist deinem Team beigetreten!',
  'log.cardsMerged': 'Karten wurden zu einer mächtigeren Karte verschmolzen!',
  'log.cardStarPlayer': '{playerName} wurde zum Starspieler befördert!',
  'log.cardMotivatingSpeech': 'Dein Team ist motiviert! +10% Stärke für den nächsten Spieltag!',

  // Log messages - Stadium
  'log.stadiumExpansionStarted': 'Bau begonnen: {stand} Erweiterung auf {newSize} Plätze.',
  'log.stadiumExpansionComplete': 'Bau abgeschlossen: {stand} hat jetzt {newSize} Plätze!',
  'log.roofConstructionStarted': 'Bau begonnen: Dach für {stand}.',
  'log.roofConstructionComplete': 'Bau abgeschlossen: {stand} hat jetzt ein Dach!',
  'stand.north': 'Nordtribüne',
  'stand.south': 'Südtribüne',
  'stand.east': 'Osttribüne',
  'stand.west': 'Westtribüne',
  'stand.corner_ne': 'Ecktribüne NO',
  'stand.corner_nw': 'Ecktribüne NW',
  'stand.corner_se': 'Ecktribüne SO',
  'stand.corner_sw': 'Ecktribüne SW',

  // Injury types
  'injury.bruise': 'Prellung',
  'injury.muscle_strain': 'Muskelzerrung',
  'injury.ligament_sprain': 'Bänderdehnung',
  'injury.muscle_tear': 'Muskelfaserriss',
  'injury.fracture': 'Knochenbruch',
  'injury.meniscus_tear': 'Meniskusriss',
  'injury.acl_tear': 'Kreuzbandriss',
  'injury.achilles_rupture': 'Achillessehnenriss',

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
  'log.playerInjured': '{playerName} hat sich verletzt: {injuryType}! Ausfall für {days} Spieltag(e).',
  'log.playerSubstitutedInjury': '{playerOutName} wird verletzungsbedingt durch {playerInName} ersetzt.',
  'log.playerSubstitutedFreshness': '{playerOutName} wird wegen niedriger Fitness durch {playerInName} ersetzt.',
  'log.playerRecovered': '{playerName} ist wieder fit und steht zur Verfügung.',
  'log.playerFired': 'Du hast deinen Spieler {playerName} entlassen.',
  'log.playerSigned': 'Glückwunsch! Du hast einen neuen Spielervertrag mit {playerName} unterschrieben.',

  // Log messages - Youth players
  'log.youthPlayerPromoted': '{playerName} wurde auf Level {level} in die A-Mannschaft befördert!',
  'log.youthPlayerFired': 'Jugendspieler {playerName} wurde aus der Jugendmannschaft entlassen.',
  'log.youthPlayerAt18Warning': 'Warnung: Folgende Jugendspieler werden nächste Saison automatisch entlassen, wenn sie nicht befördert werden: {playerNames}',

  // Log messages - Cards and suspensions
  'log.playerYellowCard': '{playerName} hat eine gelbe Karte erhalten!',
  'log.playerRedCard': '{playerName} hat eine rote Karte erhalten!',
  'log.playerFiveYellows': '{playerName} hat 5 gelbe Karten angesammelt!',
  'log.playerSuspended': '{playerName} ist gesperrt und wird das nächste Spiel verpassen.',
  'log.playerRemovedFromLineup': '{playerName} wurde aufgrund einer Sperre automatisch aus der Aufstellung entfernt.',
  'log.lineupAutoFilled': 'Deine Aufstellung war unvollständig. {playerName} wurde automatisch auf {position} gesetzt.',

  // Finance reasons
  'finance.playerSalaries': 'Spielergehälter',
  'finance.ticketRevenue': 'Ticketeinnahmen',
  'finance.stadiumTicketEarnings': 'Stadion-Ticketeinnahmen',
  'finance.sponsorPayment': 'Sponsorzahlung',
  'finance.sponsorDeal': 'Sponsorvertrag mit {name}',
  'finance.stadiumConstruction': 'Stadionbau begonnen',
  'finance.playerSold': 'Spieler verkauft: {playerName}',
  'finance.playerBought': 'Spieler gekauft: {playerName}',
  'finance.cardSold': 'Aktionskarte auf dem Markt verkauft',
  'finance.cardBought': 'Aktionskarte auf dem Markt gekauft',
  'finance.stadiumExpansion': 'Stadionerweiterung: {stand}',
  'finance.roofConstruction': 'Dachbau: {stand}',
  'finance.friendlyMatchTickets': 'Ticketeinnahmen Freundschaftsspiel',
  'finance.actionCardBonus': 'Aktionskarten-Bonus',
  'finance.leagueBonus': 'Liga-Bonus',
  'finance.promotionBonus': 'Aufstiegsbonus',
  'finance.startingBalance': 'Startguthaben',
  'finance.tvMoney': 'TV-Gelder (Platz {rank}, Liga-Level {level})',

  // Match day recap
  'recap.title': 'Zusammenfassung des {matchDay}. Spieltags',
  'recap.intro.highScoring': 'Was für ein Spieltag! In {gameCount} Partien fielen {totalGoals} Tore — ein echter Leckerbissen für die Fans.',
  'recap.intro.lowScoring': 'Ein defensiver Spieltag: nur {totalGoals} Tore in {gameCount} Spielen.',
  'recap.intro.balanced': 'Der {matchDay}. Spieltag brachte {totalGoals} Tore in {gameCount} Spielen und reichlich Spannung.',
  'recap.biggestWin': 'Der höchste Sieg des Spieltags gelang {winnerName} mit einem {goalsFor}:{goalsAgainst}-Erfolg über {loserName}.',
  'recap.topScorer.one': '{playerName} ({teamName}) war der Mann des Tages mit 1 Tor.',
  'recap.topScorer.many': '{playerName} ({teamName}) war nicht zu stoppen und erzielte {goals} Tore.',
  'recap.upset': 'Die Überraschung des Tages: {winnerName} (Platz {winnerPlace}) bezwingt Liga-Favorit {loserName} (Platz {loserPlace}).',
  'recap.redCards.one': 'Die Emotionen kochten hoch: 1 rote Karte wurde in der Liga gezeigt.',
  'recap.redCards.many': 'Die Emotionen kochten hoch: {count} rote Karten wurden in der Liga gezeigt.',
  'recap.injuries.one': '1 Spieler verletzte sich und wird kommende Partien verpassen.',
  'recap.injuries.many': '{count} Spieler verletzten sich und werden kommende Partien verpassen.',
  'recap.draws.one': '1 Partie endete unentschieden.',
  'recap.draws.many': '{count} Partien endeten unentschieden.',
  'recap.outro.predictable': 'In der Tabelle hat sich wenig getan — die Favoriten setzten sich durch.',
  'recap.outro.shaken': 'Einige Ergebnisse haben die Tabelle durcheinandergewirbelt — der nächste Spieltag verspricht Spannung.',

  // Cup log messages
  'log.cupMatchWin': 'Pokalsieg! Du hast {opponent} mit {goalsFor}:{goalsAgainst} geschlagen! Prämie: {prize}',
  'log.cupMatchLoss': 'Pokal-Aus. Verloren mit {goalsFor}:{goalsAgainst} gegen {opponent}.',
  'log.cupMatchWinExtraTime': 'Pokalsieg nach Verlängerung! Du hast {opponent} mit {goalsFor}:{goalsAgainst} (n.V.) geschlagen! Prämie: {prize}',
  'log.cupMatchLossExtraTime': 'Pokal-Aus nach Verlängerung. Verloren mit {goalsFor}:{goalsAgainst} (n.V.) gegen {opponent}.',
  'log.cupMatchWinPenalties': 'Pokalsieg im Elfmeterschießen! Du hast {opponent} mit {penaltiesFor}:{penaltiesAgainst} i.E. bezwungen (Stand nach Verlängerung: {goalsFor}:{goalsAgainst}). Prämie: {prize}',
  'log.cupMatchLossPenalties': 'Pokal-Aus im Elfmeterschießen. Verloren mit {penaltiesFor}:{penaltiesAgainst} i.E. gegen {opponent} (Stand nach Verlängerung: {goalsFor}:{goalsAgainst}).',
  'log.cupMatchDraw': 'Pokal-Unentschieden gegen {opponent} {goalsFor}:{goalsAgainst}.',
  'log.cupWinner': 'Herzlichen Glückwunsch! Du hast den Pokal gewonnen! Preis: {prize}',

  // Cup finance
  'finance.cupPrize': 'Pokalsieg-Prämie',
  'finance.cupRoundPrize': 'Pokalrunden-Prämie',

  // Building errors
  'error.buildingNotFound': 'Gebäude nicht gefunden',
  'error.buildingUnderConstruction': 'Gebäude wird bereits gebaut',
  'error.buildingMaxLevel': 'Gebäude hat bereits das maximale Level erreicht',

  // Building log messages
  'log.buildingUpgradeStarted': 'Bau begonnen: {buildingName} wird ausgebaut!',
  'log.buildingUpgradeComplete': 'Bau abgeschlossen: {buildingName} wurde ausgebaut!',

  // Building names
  'building.trainingArea': 'Trainingsgelände',
  'building.fitnessStudio': 'Fitnessstudio',
  'building.youthAcademy': 'Jugendakademie',

  // Building finance
  'finance.buildingUpgrade': 'Gebäude-Ausbau',

  // World Cup
  'worldCup.bettingClosed': 'Tipps für dieses Spiel sind nicht mehr möglich.'
}
