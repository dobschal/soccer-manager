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
  'finance.stadiumTicketEarnings': 'Stadion-Ticketeinnahmen',
  'finance.sponsorPayment': 'Sponsorzahlung',
  'finance.sponsorDeal': 'Sponsorvertrag mit {name}',
  'finance.stadiumConstruction': 'Stadionbau begonnen',
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
  'news.newSeason': 'Saison {season} hat begonnen!',

  // News templates - Transfer
  'news.transfer.1.title': 'Rekordtransfer: {playerName} wechselt für {price} zu {toTeam}',
  'news.transfer.1.text': 'In einem spektakulären Wechsel hat {playerName} seinen Transfer von {fromTeam} zu {toTeam} für {price} abgeschlossen. Dies ist der teuerste Transfer des Tages in der Liga.',
  'news.transfer.2.title': '{playerName} wechselt für viel Geld zu {toTeam}',
  'news.transfer.2.text': '{toTeam} hat sich die Dienste von {playerName} von {fromTeam} für die stattliche Summe von {price} gesichert. Der Transfer soll die Mannschaft deutlich verstärken.',
  'news.transfer.3.title': '{toTeam} gibt {price} für {playerName} aus',
  'news.transfer.3.text': 'Im größten Deal des Tages hat {toTeam} {playerName} von {fromTeam} für {price} verpflichtet. Die Fans sind gespannt, was der Neuzugang dem Team bringen wird.',
  'news.transfer.4.title': 'Eilmeldung: {playerName} wechselt zu {toTeam}',
  'news.transfer.4.text': 'Die Transfersaga ist vorbei! {playerName} hat offiziell bei {toTeam} von {fromTeam} für {price} unterschrieben. Die Verpflichtung könnte entscheidend im Titelkampf sein.',
  'news.transfer.5.title': '{toTeam} sichert sich die Unterschrift von {playerName}',
  'news.transfer.5.text': 'Nach tagelangen Verhandlungen hat {toTeam} endlich {playerName} von {fromTeam} verpflichtet. Der {price}-Deal ist ein klares Zeichen der Ambitionen des Vereins.',

  // News templates - Highest Win
  'news.highestWin.1.title': '{teamName} dominiert mit {goalDiff}-Tore-Sieg',
  'news.highestWin.1.text': '{teamName} lieferte eine überragende Leistung und zerstörte den Gegner mit {goalsFor}:{goalsAgainst}. Dies war der höchste Sieg des Spieltags in der Liga.',
  'news.highestWin.2.title': 'Klarer Sieg: {teamName} gewinnt {goalsFor}:{goalsAgainst}',
  'news.highestWin.2.text': '{teamName} zeigte eine klinische Vorstellung und demontierte den Gegner mit {goalDiff} Toren Unterschied. Das Ergebnis sendet eine klare Botschaft an den Rest der Liga.',
  'news.highestWin.3.title': '{teamName} triumphiert mit {goalDiff}-Tore-Kantersieg',
  'news.highestWin.3.text': 'Es war ein unvergesslicher Tag für {teamName}, die einen beeindruckenden {goalsFor}:{goalsAgainst}-Sieg einfuhren. Der überzeugende Erfolg unterstreicht ihre Titelambitionen.',
  'news.highestWin.4.title': 'Demontage: {teamName} cruist zu {goalsFor}:{goalsAgainst}-Sieg',
  'news.highestWin.4.text': '{teamName} zeigte keine Gnade bei einem vernichtenden {goalDiff}-Tore-Sieg. Ihre Offensivstärke war in voller Pracht zu sehen, als sie alle Gegenwehr beiseite fegten.',
  'news.highestWin.5.title': '{teamName} setzt ein Zeichen',
  'news.highestWin.5.text': 'Was für eine Vorstellung! {teamName} deklassierte ihre Rivalen {goalsFor}:{goalsAgainst} in einer wahren Meisterleistung. Der {goalDiff}-Tore-Unterschied spricht Bände.',

  // News templates - Position First
  'news.positionFirst.1.title': '{teamName} erobert die Tabellenspitze!',
  'news.positionFirst.1.text': '{teamName} ist nach einer beeindruckenden Serie an die Spitze der Liga geklettert. Können sie ihre Position an der Spitze verteidigen?',
  'news.positionFirst.2.title': 'Neue Spitzenreiter: {teamName} übernimmt Platz eins',
  'news.positionFirst.2.text': '{teamName} hat sich an die Tabellenspitze gesetzt. Das Team wird versuchen, seine Position in den kommenden Wochen zu festigen.',
  'news.positionFirst.3.title': '{teamName} rückt auf Platz eins vor',
  'news.positionFirst.3.text': 'Nach einer weiteren starken Leistung steht {teamName} nun an der Tabellenspitze. Ihre jüngste Form war schlichtweg überragend.',
  'news.positionFirst.4.title': '{teamName} übernimmt die Führung',
  'news.positionFirst.4.text': 'Die Liga hat einen neuen Spitzenreiter! {teamName} hat die Konkurrenz überholt und belegt nun den ersten Platz. Das Titelrennen wird spannend.',
  'news.positionFirst.5.title': 'Tabellenführung: {teamName} zeigt den Weg',
  'news.positionFirst.5.text': '{teamName} hat es geschafft! Sie sind nun die Favoriten im Meisterschaftsrennen. Ihre Konstanz hat sich endlich mit dem Sprung an die Spitze ausgezahlt.',

  // News templates - Position Last
  'news.positionLast.1.title': 'Abstiegsängste bei {teamName} wachsen',
  'news.positionLast.1.text': '{teamName} ist auf den letzten Tabellenplatz abgerutscht. Mit dem drohenden Abstieg lastet der Druck, schnell die Wende zu schaffen.',
  'news.positionLast.2.title': '{teamName} fällt auf den letzten Platz',
  'news.positionLast.2.text': 'Schwere Zeiten für {teamName}, die sich am Tabellenende wiederfinden. Das Team muss schnell in Form kommen, um den Abstieg zu vermeiden.',
  'news.positionLast.3.title': 'Tabellenletzter: {teamName} in der Krise',
  'news.positionLast.3.text': '{teamName} befindet sich nach dem Absturz auf den letzten Platz in der Abstiegszone. Das Management muss schnell handeln, um die Saison zu retten.',
  'news.positionLast.4.title': '{teamName} sinkt auf den letzten Platz',
  'news.positionLast.4.text': 'Dunkle Tage für {teamName}, die den Tiefpunkt in der Tabelle erreicht haben. Eine dramatische Wende ist nötig, um den Abstieg zu vermeiden.',
  'news.positionLast.5.title': 'Krise bei {teamName}: Letzter Platz in der Liga',
  'news.positionLast.5.text': 'Die Alarmglocken läuten bei {teamName}. Auf dem letzten Platz stehend, kämpft der Verein um den Klassenerhalt.',

  // News templates - Stadium Extension
  'news.stadiumExtension.1.title': '{teamName} erweitert Stadion',
  'news.stadiumExtension.1.text': '{teamName} hat in die Zukunft investiert und das Stadion erweitert. Die erhöhte Kapazität wird helfen, mehr Fans anzuziehen und zusätzliche Einnahmen zu generieren.',
  'news.stadiumExtension.2.title': 'Neue Stadionarbeiten bei {teamName}',
  'news.stadiumExtension.2.text': '{teamName} hat mit großen Stadionverbesserungen begonnen. Die Erweiterung zeigt die Ambitionen des Vereins, sowohl sportlich als auch wirtschaftlich zu wachsen.',
  'news.stadiumExtension.3.title': '{teamName} investiert in Stadion-Upgrade',
  'news.stadiumExtension.3.text': 'Große Neuigkeiten von {teamName}: Stadionerweiterungspläne wurden angekündigt. Die Verbesserungen werden das Spieltagserlebnis für die Fans verbessern.',
  'news.stadiumExtension.4.title': 'Bauarbeiten beginnen im Stadion von {teamName}',
  'news.stadiumExtension.4.text': 'Die Kräne sind aufgestellt und die Arbeiten an der Stadionerweiterung von {teamName} haben begonnen. Die Fans können sich auf verbesserte Einrichtungen freuen.',
  'news.stadiumExtension.5.title': '{teamName} startet Stadionentwicklung',
  'news.stadiumExtension.5.text': '{teamName} baut für die Zukunft mit einem bedeutenden Stadionerweiterungsprojekt. Die Investition spiegelt die wachsenden Ambitionen des Vereins wider.',

  // News templates - Level Up
  'news.levelUp.1.title': '{playerName} erreicht neue Höhen bei {teamName}',
  'news.levelUp.1.text': '{playerName} ist auf Level {newLevel} aufgestiegen und zeigt seine kontinuierliche Entwicklung bei {teamName}. Der Spieler wird zu einem wichtigen Faktor für das Team.',
  'news.levelUp.2.title': '{playerName} steigt auf Level {newLevel}',
  'news.levelUp.2.text': 'Tolle Neuigkeiten für {teamName}: {playerName} hat sich auf Level {newLevel} verbessert. Die harte Arbeit im Training zahlt sich aus.',
  'news.levelUp.3.title': 'Aufsteigender Stern: {playerName} erreicht Level {newLevel}',
  'news.levelUp.3.text': '{teamName}s {playerName} beeindruckt weiterhin und erreicht Level {newLevel}. Die Verbesserung macht ihn zu einem noch wertvolleren Kadermitglied.',
  'news.levelUp.4.title': '{playerName} durchbricht Level {newLevel}',
  'news.levelUp.4.text': 'Was für ein Meilenstein für {playerName}! Der Star von {teamName} hat Level {newLevel} erreicht und festigt seinen Platz als eines der Top-Talente der Liga.',
  'news.levelUp.5.title': '{teamName}s {playerName} erreicht Level {newLevel}',
  'news.levelUp.5.text': 'Die Entwicklung geht weiter! {playerName} ist auf Level {newLevel} aufgestiegen, ein Zeugnis seiner Hingabe und des exzellenten Trainerteams von {teamName}.'
}
