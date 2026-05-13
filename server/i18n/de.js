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
  'error.offerLimitReached': 'Du kannst nur 3 Angebote pro Spieler pro Spieltag abgeben',

  // Stadium errors
  'error.standNotFound': 'Tribüne nicht gefunden',
  'error.standUnderConstruction': 'Diese Tribüne wird bereits gebaut',
  'error.standAlreadyHasRoof': 'Diese Tribüne hat bereits ein Dach',
  'error.cannotExpandFurther': 'Kann nicht weiter erweitert werden',
  'error.invalidTicketPrice': 'Ungültiger Ticketpreis',
  'error.invalidStadiumName': 'Stadionname muss 1-100 Zeichen lang sein',

  // Player errors
  'error.teamTooSmall': 'Dein Team muss mindestens 14 Spieler haben.',
  'error.invalidPosition': 'Ungültige Position',
  'error.positionAlreadyTaken': 'Position ist bereits besetzt',
  'error.playerNotInTeam': 'Spieler ist nicht in deinem Team',

  // Youth player errors
  'error.youthPlayerNotFound': 'Jugendspieler nicht gefunden',
  'error.notYourYouthPlayer': 'Das ist nicht dein Jugendspieler',
  'error.youthPlayerTooYoung': 'Jugendspieler muss mindestens 16 Jahre alt sein, um befördert zu werden',

  // Action card errors
  'error.cardNotFound': 'Aktionskarte nicht gefunden',
  'error.cardAlreadyPlayed': 'Diese Karte wurde bereits gespielt',
  'error.cannotMergeCards': 'Diese Karten können nicht verschmolzen werden',
  'error.notEnoughCards': 'Nicht genug Karten zum Verschmelzen',
  'error.invalidCardAction': 'Ungültige Kartenaktion',
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
  'log.sellOfferCreated': 'Du hast ein Verkaufsangebot für {playerName} zu {price} erstellt.',

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
  'finance.stadiumExpansion': 'Stadionerweiterung: {stand}',
  'finance.roofConstruction': 'Dachbau: {stand}',
  'finance.friendlyMatchTickets': 'Ticketeinnahmen Freundschaftsspiel',
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
  'news.transfer.1.text': 'In einem spektakulären Wechsel hat {playerName} seinen Transfer von {fromTeam} zu {toTeam} für {price} abgeschlossen. Dies ist der teuerste Transfer des Tages in der Liga. Die Neuverpflichtung bringt wichtige Kadertiefe, während das Team um den Titel kämpft. Rivalisierende Manager werden genau beobachten, wie dieser Deal das Titelrennen beeinflusst.',
  'news.transfer.2.title': '{playerName} wechselt für viel Geld zu {toTeam}',
  'news.transfer.2.text': '{toTeam} hat sich die Dienste von {playerName} von {fromTeam} für die stattliche Summe von {price} gesichert. Der Transfer soll die Mannschaft deutlich verstärken und die Titelambitionen befeuern. Derweil wird {fromTeam} die Einnahmen klug reinvestieren wollen. Dieser Deal könnte die Saison beider Vereine prägen.',
  'news.transfer.3.title': '{toTeam} gibt {price} für {playerName} aus',
  'news.transfer.3.text': 'Im größten Deal des Tages hat {toTeam} {playerName} von {fromTeam} für {price} verpflichtet. Die Fans sind gespannt, was der Neuzugang dem Team bringen wird. Das finanzielle Engagement zeigt die Entschlossenheit des Vorstands, auf höchstem Niveau mitzuhalten. Analysten sehen darin möglicherweise das Schnäppchen der Saison.',
  'news.transfer.4.title': 'Eilmeldung: {playerName} wechselt zu {toTeam}',
  'news.transfer.4.text': 'Die Transfersaga ist vorbei! {playerName} hat offiziell bei {toTeam} von {fromTeam} für {price} unterschrieben. Die Verpflichtung könnte entscheidend im Titelkampf sein, da der Kader ein großes Upgrade erhält. {fromTeam} muss schnell einen passenden Ersatz finden. Alle Augen sind darauf gerichtet, wie sich der Neuzugang in die Startelf einfügt.',
  'news.transfer.5.title': '{toTeam} sichert sich die Unterschrift von {playerName}',
  'news.transfer.5.text': 'Nach tagelangen Verhandlungen hat {toTeam} endlich {playerName} von {fromTeam} verpflichtet. Der {price}-Deal ist ein klares Zeichen der Ambitionen des Vereins und eine bedeutende finanzielle Investition. {fromTeam} hat nun eine Lücke zu füllen, aber Geld zum Ausgeben. Die Fans träumen bereits davon, was dieser Transfer für die Saison bedeuten könnte.',

  // News templates - Highest Win
  'news.highestWin.1.title': '{teamName} dominiert mit {goalDiff}-Tore-Sieg',
  'news.highestWin.1.text': '{teamName} lieferte eine überragende Leistung und zerstörte den Gegner mit {goalsFor}:{goalsAgainst}. Dies war der höchste Sieg des Spieltags in der Liga. Das Ergebnis könnte große Auswirkungen auf die Tabelle haben, da die Saison in eine entscheidende Phase eintritt. Gegnerische Trainer werden das Spielmaterial genau studieren.',
  'news.highestWin.2.title': 'Klarer Sieg: {teamName} gewinnt {goalsFor}:{goalsAgainst}',
  'news.highestWin.2.text': '{teamName} zeigte eine klinische Vorstellung und demontierte den Gegner mit {goalDiff} Toren Unterschied. Das Ergebnis sendet eine klare Botschaft an den Rest der Liga. Mit dem Selbstvertrauen auf dem Höhepunkt wird das Team im Titelrennen immer gefährlicher. Ihre Tordifferenz gehört nun zu den besten der Division.',
  'news.highestWin.3.title': '{teamName} triumphiert mit {goalDiff}-Tore-Kantersieg',
  'news.highestWin.3.text': 'Es war ein unvergesslicher Tag für {teamName}, die einen beeindruckenden {goalsFor}:{goalsAgainst}-Sieg einfuhren. Der überzeugende Erfolg unterstreicht ihre Titelambitionen und setzt jeden anderen Anwärter unter Druck. Die geschlagene Mannschaft wird sich fragen, was schiefgelaufen ist. Wenige Teams in der Liga können eine solche Feuerkraft aufbieten.',
  'news.highestWin.4.title': 'Demontage: {teamName} cruist zu {goalsFor}:{goalsAgainst}-Sieg',
  'news.highestWin.4.text': '{teamName} zeigte keine Gnade bei einem vernichtenden {goalDiff}-Tore-Sieg. Ihre Offensivstärke war in voller Pracht zu sehen, als sie alle Gegenwehr beiseite fegten. Ein solcher Unterschied kommt nicht oft vor und wird die Tordifferenz des Teams deutlich verbessern. Die Liga sollte aufhorchen.',
  'news.highestWin.5.title': '{teamName} setzt ein Zeichen',
  'news.highestWin.5.text': 'Was für eine Vorstellung! {teamName} deklassierte ihre Rivalen {goalsFor}:{goalsAgainst} in einer wahren Meisterleistung. Der {goalDiff}-Tore-Unterschied spricht Bände und lässt keinen Zweifel daran, wer das Spiel kontrolliert hat. Dieser Sieg wird in der Liga noch wochenlang nachhallen. Die geschlagene Mannschaft muss sich schnell sammeln.',

  // News templates - Position First
  'news.positionFirst.1.title': '{teamName} erobert die Tabellenspitze!',
  'news.positionFirst.1.text': '{teamName} ist nach einer beeindruckenden Serie an die Spitze der Liga geklettert. Können sie ihre Position an der Spitze verteidigen? Das Verfolgerfeld wird verzweifelt versuchen, den Abstand zu verkürzen. Jedes Spiel von hier an hat Meisterschaftsbedeutung.',
  'news.positionFirst.2.title': 'Neue Spitzenreiter: {teamName} übernimmt Platz eins',
  'news.positionFirst.2.text': '{teamName} hat sich an die Tabellenspitze gesetzt. Das Team wird versuchen, seine Position in den kommenden Wochen zu festigen. Die jüngsten Ergebnisse deuten darauf hin, dass dies mehr als nur ein vorübergehender Aufschwung ist. Der bisherige Spitzenreiter wird alles daran setzen, den ersten Platz zurückzuerobern.',
  'news.positionFirst.3.title': '{teamName} rückt auf Platz eins vor',
  'news.positionFirst.3.text': 'Nach einer weiteren starken Leistung steht {teamName} nun an der Tabellenspitze. Ihre jüngste Form war schlichtweg überragend. Der Abstand zum Zweiten mag knapp sein, aber das Momentum ist eindeutig auf ihrer Seite. Dies könnte der Wendepunkt im Titelrennen sein.',
  'news.positionFirst.4.title': '{teamName} übernimmt die Führung',
  'news.positionFirst.4.text': 'Die Liga hat einen neuen Spitzenreiter! {teamName} hat die Konkurrenz überholt und belegt nun den ersten Platz. Das Titelrennen wird spannend und jeder Punkt zählt. Die Kadertiefe und taktische Disziplin von {teamName} waren die Schlüsselfaktoren für ihren Aufstieg. Kann sie noch jemand stoppen?',
  'news.positionFirst.5.title': 'Tabellenführung: {teamName} zeigt den Weg',
  'news.positionFirst.5.text': '{teamName} hat es geschafft! Sie sind nun die Favoriten im Meisterschaftsrennen. Ihre Konstanz hat sich endlich mit dem Sprung an die Spitze ausgezahlt. Das Team hat in dieser Saison unglaubliche Widerstandskraft gezeigt. Alle Augen werden auf die kommenden Spiele gerichtet sein.',

  // News templates - Position Last
  'news.positionLast.1.title': 'Abstiegsängste bei {teamName} wachsen',
  'news.positionLast.1.text': '{teamName} ist auf den letzten Tabellenplatz abgerutscht. Mit dem drohenden Abstieg lastet der Druck, schnell die Wende zu schaffen. Die verbleibenden Spiele der Saison werden für die strauchelnde Mannschaft zu Endspielen. Die Fans fordern Veränderungen, bevor es zu spät ist.',
  'news.positionLast.2.title': '{teamName} fällt auf den letzten Platz',
  'news.positionLast.2.text': 'Schwere Zeiten für {teamName}, die sich am Tabellenende wiederfinden. Das Team muss schnell in Form kommen, um den Abstieg zu vermeiden. Neuzugänge oder eine taktische Umstellung könnten die Antwort auf ihre Probleme sein. Die Zeit für den Klassenerhalt wird knapp.',
  'news.positionLast.3.title': 'Tabellenletzter: {teamName} in der Krise',
  'news.positionLast.3.text': '{teamName} befindet sich nach dem Absturz auf den letzten Platz in der Abstiegszone. Das Management muss schnell handeln, um die Saison zu retten. Jedes kommende Spiel ist nun ein Muss-Gewinn-Spiel für die gebeutelte Mannschaft. Die Moral im Kader soll Berichten zufolge auf einem Tiefpunkt sein.',
  'news.positionLast.4.title': '{teamName} sinkt auf den letzten Platz',
  'news.positionLast.4.text': 'Dunkle Tage für {teamName}, die den Tiefpunkt in der Tabelle erreicht haben. Eine dramatische Wende ist nötig, um den Abstieg zu vermeiden. Der Kader muss Charakter zeigen und um jeden Punkt kämpfen. Ob das aktuelle Management eine Rettung bewerkstelligen kann, bleibt abzuwarten.',
  'news.positionLast.5.title': 'Krise bei {teamName}: Letzter Platz in der Liga',
  'news.positionLast.5.text': 'Die Alarmglocken läuten bei {teamName}. Auf dem letzten Platz stehend, kämpft der Verein um den Klassenerhalt. Der Vorstand erwägt Berichten zufolge alle Optionen, um den Abwärtstrend zu stoppen. Mit jedem Spieltag wird der Spielraum für Fehler kleiner.',

  // News templates - Stadium Extension
  'news.stadiumExtension.1.title': '{teamName} erweitert Stadion',
  'news.stadiumExtension.1.text': '{teamName} hat in die Zukunft investiert und das Stadion erweitert. Die erhöhte Kapazität wird helfen, mehr Fans anzuziehen und an Spieltagen zusätzliche Einnahmen zu generieren. Der Vorstand sieht die Erweiterung als essentiell, um mit den größten Vereinen der Liga konkurrieren zu können. Nach Fertigstellung soll die Atmosphäre bei Heimspielen neue Höhen erreichen.',
  'news.stadiumExtension.2.title': 'Neue Stadionarbeiten bei {teamName}',
  'news.stadiumExtension.2.text': '{teamName} hat mit großen Stadionverbesserungen begonnen. Die Erweiterung zeigt die Ambitionen des Vereins, sowohl sportlich als auch wirtschaftlich zu wachsen. Mehr Kapazität bedeutet mehr Ticketeinnahmen und lautere Unterstützung für das Team. Die Bauarbeiten sollen innerhalb weniger Spieltage abgeschlossen sein.',
  'news.stadiumExtension.3.title': '{teamName} investiert in Stadion-Upgrade',
  'news.stadiumExtension.3.text': 'Große Neuigkeiten von {teamName}: Stadionerweiterungspläne wurden angekündigt. Die Verbesserungen werden das Spieltagserlebnis für die Fans verbessern. Die zusätzlichen Plätze werden helfen, die wachsende Nachfrage nach Tickets zu befriedigen. Ein klares Signal, dass der Vorstand langfristig denkt.',
  'news.stadiumExtension.4.title': 'Bauarbeiten beginnen im Stadion von {teamName}',
  'news.stadiumExtension.4.text': 'Die Kräne sind aufgestellt und die Arbeiten an der Stadionerweiterung von {teamName} haben begonnen. Die Fans können sich auf verbesserte Einrichtungen freuen. Das Projekt stellt ein bedeutendes finanzielles Engagement des Vereins dar. Größere Zuschauerzahlen werden dem Team einen noch größeren Heimvorteil verschaffen.',
  'news.stadiumExtension.5.title': '{teamName} startet Stadionentwicklung',
  'news.stadiumExtension.5.text': '{teamName} baut für die Zukunft mit einem bedeutenden Stadionerweiterungsprojekt. Die Investition spiegelt die wachsenden Ambitionen und die steigende Fanbasis des Vereins wider. Mehr Plätze bedeuten mehr Spieltagseinnahmen, die in den Kader reinvestiert werden können. Das erweiterte Stadion wird zur Festung für die Heimmannschaft.',

  // News templates - Level Up
  'news.levelUp.1.title': '{playerName} erreicht neue Höhen bei {teamName}',
  'news.levelUp.1.text': '{playerName} ist auf Level {newLevel} aufgestiegen und zeigt seine kontinuierliche Entwicklung bei {teamName}. Der Spieler wird zu einem wichtigen Faktor für das Team. Seine wachsende Stärke wird die Aufmerksamkeit größerer Vereine auf sich ziehen, und sein Marktwert steigt entsprechend. Das Trainerteam verdient Anerkennung für die Förderung dieses Talents.',
  'news.levelUp.2.title': '{playerName} steigt auf Level {newLevel}',
  'news.levelUp.2.text': 'Tolle Neuigkeiten für {teamName}: {playerName} hat sich auf Level {newLevel} verbessert. Die harte Arbeit im Training zahlt sich reichlich aus. Diese Entwicklung stärkt den Kader und könnte der entscheidende Vorteil in engen Spielen sein. Scouts in der ganzen Liga haben die Verbesserung zur Kenntnis genommen.',
  'news.levelUp.3.title': 'Aufsteigender Stern: {playerName} erreicht Level {newLevel}',
  'news.levelUp.3.text': '{teamName}s {playerName} beeindruckt weiterhin und erreicht Level {newLevel}. Die Verbesserung macht ihn zu einem noch wertvolleren Kadermitglied. Mit jedem gewonnenen Level steigt der Marktwert des Spielers weiter. Das Team wird bestrebt sein, einen langfristigen Vertrag zu sichern.',
  'news.levelUp.4.title': '{playerName} durchbricht Level {newLevel}',
  'news.levelUp.4.text': 'Was für ein Meilenstein für {playerName}! Der Star von {teamName} hat Level {newLevel} erreicht und festigt seinen Platz als eines der Top-Talente der Liga. Dieser Fortschritt ist das direkte Ergebnis konstanter Leistungen und engagiertem Training. Rivalisierende Vereine könnten bald mit Transferangeboten anklopfen.',
  'news.levelUp.5.title': '{teamName}s {playerName} erreicht Level {newLevel}',
  'news.levelUp.5.text': 'Die Entwicklung geht weiter! {playerName} ist auf Level {newLevel} aufgestiegen, ein Zeugnis seiner Hingabe und des exzellenten Trainerteams von {teamName}. Die steigende Stärke des Spielers macht ihn zum Eckpfeiler der Mannschaftsstrategie. Die Fans werden begeistert sein zu sehen, wie ihr Star weiter wächst.',

  // News templates - Cup Match
  'news.cupMatch.1.title': 'Pokal {roundLabel}: {winnerName} setzt sich gegen {loserName} durch',
  'news.cupMatch.1.text': '{winnerName} ist mit einem überzeugenden {goalsFor}:{goalsAgainst}-Sieg über {loserName} im {roundLabel} eine Runde weitergekommen. Der Pokaltraum lebt für die Sieger weiter, während sich {loserName} nun auf die Liga konzentrieren muss. Die Leistung zeigte die Kadertiefe von {winnerName} auf der großen Bühne. Der Pokalsieg rückt einen Schritt näher.',
  'news.cupMatch.2.title': 'Pokal-Drama: {winnerName} wirft {loserName} raus',
  'news.cupMatch.2.text': 'Es gab Drama im Pokal, als {winnerName} {loserName} mit einem {goalsFor}:{goalsAgainst} im {roundLabel} eliminierte. Es war ein denkwürdiger Abend für die siegreiche Mannschaft, die enorme Gelassenheit zeigte. {loserName} gab alles, aber es reichte nicht zum Weiterkommen. Die Auslosung der nächsten Runde erwartet die Gewinner.',
  'news.cupMatch.3.title': '{winnerName} marschiert weiter im Pokal-{roundLabel}',
  'news.cupMatch.3.text': '{winnerName} setzte den Pokallauf mit einem {goalsFor}:{goalsAgainst}-Triumph über {loserName} im {roundLabel} fort. Das K.o.-Format bringt das Beste aus dieser Mannschaft hervor und die Fans wagen zu träumen. {loserName} wird enttäuscht sein, kann aber erhobenen Hauptes gehen. Der Weg ins Finale wird kürzer.',
  'news.cupMatch.4.title': 'Pokal-Thriller: {winnerName} schlägt {loserName} {goalsFor}:{goalsAgainst}',
  'news.cupMatch.4.text': 'In einem packenden Pokal-{roundLabel} ging {winnerName} mit einem {goalsFor}:{goalsAgainst}-Sieg über {loserName} als Sieger hervor. Die Intensität des Pokalfußballs war während des gesamten Spiels zu spüren. {winnerName} kann nun zuversichtlich in die nächste Runde blicken. Für {loserName} richtet sich der Fokus wieder auf die Liga.',
  'news.cupMatch.5.title': '{winnerName} zieht nach {roundLabel}-Sieg in nächste Pokalrunde ein',
  'news.cupMatch.5.text': '{winnerName} sicherte sich den Platz in der nächsten Pokalrunde durch einen {goalsFor}:{goalsAgainst}-Sieg über {loserName} im {roundLabel}. Die Pokalkampagne gewinnt an Schwung und Preisgeld winkt. {loserName} kämpfte tapfer, wurde aber letztlich deklassiert. Die verbleibenden Pokalaspiranten sollten gewarnt sein.',

  // Cup log messages
  'log.cupMatchWin': 'Pokalsieg! Du hast {opponent} mit {goalsFor}:{goalsAgainst} geschlagen! Prämie: {prize}',
  'log.cupMatchLoss': 'Pokal-Aus. Verloren mit {goalsFor}:{goalsAgainst} gegen {opponent}.',
  'log.cupMatchDraw': 'Pokal-Unentschieden gegen {opponent} {goalsFor}:{goalsAgainst}. Im Elfmeterschießen entschieden.',
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

  // Building finance
  'finance.buildingUpgrade': 'Gebäude-Ausbau'
}
