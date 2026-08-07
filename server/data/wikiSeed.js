/**
 * Seed content for the public wiki (#441). Each topic provides an English and
 * a German entry. The wiki renders the `text` as plain text (HTML-escaped, with
 * newlines turned into <br>), so the bodies below use plain prose and "•"
 * bullets — no Markdown. All entries use sort_order 0 so the list ends up
 * alphabetically sorted by title within each locale.
 *
 * @typedef {object} WikiSeedLocale
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} text
 *
 * @typedef {object} WikiSeedTopic
 * @property {string} key - stable page key used to link in-game pages to their
 *   wiki article (#456). Locale-independent; never shown to the user.
 * @property {WikiSeedLocale} en
 * @property {WikiSeedLocale} de
 *
 * @type {WikiSeedTopic[]}
 */
export const WIKI_SEED = [
  // ─── Action Cards ────────────────────────────────────────────────────────
  {
    key: 'action-cards',
    en: {
      title: 'Action Cards',
      subtitle: 'Random reward cards you collect after every match day',
      text: `After every match day each team receives a set of action cards. You reveal them with a flip animation and decide when and where to play them.

Card types:
• Level Up (40 / 70 / 100) – raises one player by one level. The number is the level cap the card can be used up to. Two Level-Up 40 cards merge into one Level-Up 70, and two 70 cards merge into one 100.
• Freshness +5% / +10% / +20% – instantly restores fitness for one player (capped at 100%).
• New Youth Player 1 – recruits a young talent (level 1–5, talent 10–50%). The default youth card without a Youth Academy.
• New Youth Player 2 – recruits a stronger talent (level 5–10, talent 30–75%). Requires Youth Academy level 2.
• New Youth Player 3 – recruits a top talent (level 10–15, talent 50–100%). Requires Youth Academy level 3.
• Bonus 100K – adds 100,000 € to your account.
• Star Player – permanently boosts a player's match strength by 10%.
• Motivating Speech – gives your whole team a +10% strength bonus for the next match day.
• Spy – reveals another team's tactics and lineup. Your next opponent is preselected, but you can scout any team you search for. The card is used up the moment the report is revealed; the latest report stays visible on your team page.

Good to know:
• The probability of receiving the stronger cards rises as you upgrade your Training Area, Fitness Studio and Youth Academy buildings.
• A single player can gain at most 20 levels per season through cards.
• You can hold at most 10 unplayed cards of the same type – play or trade some away before you can claim more of that type.
• At most 3 New Youth Player cards are handed out per season, so young talents stay scarce.
• Cards you don't need can be traded with other managers on the Action Card Marketplace.
• Save your Motivating Speech and Freshness cards for important matches.`
    },
    de: {
      title: 'Action Cards',
      subtitle: 'Zufällige Belohnungskarten nach jedem Spieltag',
      text: `Nach jedem Spieltag erhält jedes Team eine Reihe von Action Cards. Du deckst sie mit einer Flip-Animation auf und entscheidest selbst, wann und wo du sie einsetzt.

Kartentypen:
• Level Up (40 / 70 / 100) – hebt einen Spieler um ein Level. Die Zahl ist die Level-Obergrenze, bis zu der die Karte genutzt werden kann. Zwei Level-Up-40-Karten verschmelzen zu einer Level-Up-70, zwei 70er-Karten zu einer 100er.
• Frische +5% / +10% / +20% – stellt sofort die Fitness eines Spielers wieder her (maximal 100%).
• Neuer Jugendspieler 1 – holt ein junges Talent (Level 1–5, Talent 10–50%). Die Standard-Jugendkarte ohne Jugendakademie.
• Neuer Jugendspieler 2 – holt ein stärkeres Talent (Level 5–10, Talent 30–75%). Braucht Jugendakademie-Stufe 2.
• Neuer Jugendspieler 3 – holt ein Top-Talent (Level 10–15, Talent 50–100%). Braucht Jugendakademie-Stufe 3.
• Bonus 100K – schreibt 100.000 € auf deinem Konto gut.
• Starspieler – erhöht die Spielstärke eines Spielers dauerhaft um 10%.
• Motivationsrede – gibt deinem ganzen Team am nächsten Spieltag +10% Stärke.
• Spion – deckt Taktik und Aufstellung eines anderen Teams auf. Dein nächster Gegner ist vorausgewählt, du kannst aber jedes gesuchte Team ausspähen. Die Karte wird verbraucht, sobald der Bericht aufgedeckt ist; der letzte Bericht bleibt auf deiner Team-Seite sichtbar.

Gut zu wissen:
• Die Wahrscheinlichkeit für die stärkeren Karten steigt, wenn du Trainingsgelände, Fitness-Studio und Jugendakademie ausbaust.
• Ein Spieler kann pro Saison höchstens 20 Level durch Karten gewinnen.
• Du kannst höchstens 10 ungenutzte Karten desselben Typs halten – setze oder tausche welche ein, bevor du weitere dieses Typs annehmen kannst.
• Pro Saison werden höchstens 3 „Neuer Jugendspieler“-Karten vergeben, damit Talente knapp bleiben.
• Karten, die du nicht brauchst, kannst du auf dem Action-Card-Marktplatz mit anderen Managern tauschen.
• Hebe dir Motivationsrede und Frische-Karten für wichtige Spiele auf.`
    }
  },

  // ─── Action Card Marketplace ───────────────────────────────────────────────
  {
    key: 'action-card-market',
    en: {
      title: 'Action Card Marketplace',
      subtitle: 'Trade action cards with other managers',
      text: `The marketplace lets you swap action cards you don't need for cards (and cash) from other managers. Every trade is a negotiation: one side offers cards, the other bids for them.

Creating an offer:
• Bundle one or more of your action cards into an offer and add an optional comment describing what you are looking for.
• The cards in an open offer are locked (escrowed) – you can't play or offer them elsewhere until the offer is settled or cancelled.
• You may have at most 10 open offers at once. Cancel an offer to get its cards back instantly.

Bidding and accepting:
• On someone else's offer you can place a bid made of money, cards, or both.
• Any cards you put into a bid are locked until the bid is accepted, rejected or cancelled; the money is only checked now and moved when the bid is accepted.
• The offering manager picks one bid to accept. The cards and money change hands, and all competing bids are automatically rejected and returned.

Good to know:
• Both sides can see a trade history of completed deals, including which cards were exchanged and the money delta.
• You'll be notified live when the offers or bids relevant to you change.`
    },
    de: {
      title: 'Action-Card-Marktplatz',
      subtitle: 'Action Cards mit anderen Managern tauschen',
      text: `Auf dem Marktplatz tauschst du nicht benötigte Action Cards gegen Karten (und Geld) anderer Manager. Jeder Handel ist eine Verhandlung: Eine Seite bietet Karten an, die andere bietet darauf.

Angebot erstellen:
• Bündle eine oder mehrere deiner Action Cards zu einem Angebot und füge optional einen Kommentar hinzu, was du suchst.
• Die Karten in einem offenen Angebot sind gesperrt (hinterlegt) – du kannst sie nicht spielen oder anderweitig anbieten, bis das Angebot abgeschlossen oder abgebrochen ist.
• Du kannst höchstens 10 offene Angebote gleichzeitig haben. Beim Abbrechen bekommst du die Karten sofort zurück.

Bieten und annehmen:
• Auf ein fremdes Angebot kannst du ein Gebot aus Geld, Karten oder beidem abgeben.
• Karten in einem Gebot sind gesperrt, bis es angenommen, abgelehnt oder zurückgezogen wird; das Geld wird jetzt nur geprüft und erst beim Annehmen überwiesen.
• Der anbietende Manager wählt ein Gebot zum Annehmen aus. Karten und Geld wechseln den Besitzer, alle konkurrierenden Gebote werden automatisch abgelehnt und zurückgegeben.

Gut zu wissen:
• Beide Seiten sehen eine Handelshistorie abgeschlossener Deals, inklusive der getauschten Karten und der Geld-Differenz.
• Du wirst live benachrichtigt, wenn sich für dich relevante Angebote oder Gebote ändern.`
    }
  },

  // ─── Direct Messages ───────────────────────────────────────────────────────
  {
    key: 'chat',
    en: {
      title: 'Direct Messages',
      subtitle: 'Chat one-on-one with other managers',
      text: `You can send private one-on-one messages to any other manager – for arranging trades, friendlies or just talking football.

How it works:
• Open a chat from a manager's profile or from your conversations list on the dashboard. Each conversation groups all messages with that one person.
• A message can contain text (up to 2,000 characters) and/or an image (JPG, PNG, GIF or WebP, up to 2 MB).
• Messages arrive live while you're online. When you're away you get a push notification that links straight into the chat.
• Messages you haven't read yet are counted in the "Action Required" badge on your dashboard, and are marked as read as soon as you open the conversation.`
    },
    de: {
      title: 'Direktnachrichten',
      subtitle: 'Eins-zu-eins mit anderen Managern chatten',
      text: `Du kannst jedem anderen Manager private Eins-zu-eins-Nachrichten schicken – um Tauschgeschäfte oder Freundschaftsspiele zu vereinbaren oder einfach über Fußball zu reden.

So funktioniert es:
• Öffne einen Chat über das Profil eines Managers oder über deine Unterhaltungsliste auf dem Dashboard. Jede Unterhaltung bündelt alle Nachrichten mit dieser einen Person.
• Eine Nachricht kann Text (bis zu 2.000 Zeichen) und/oder ein Bild (JPG, PNG, GIF oder WebP, bis zu 2 MB) enthalten.
• Nachrichten kommen live an, während du online bist. Bist du abwesend, erhältst du eine Push-Benachrichtigung, die direkt in den Chat führt.
• Noch ungelesene Nachrichten zählen im „Aktion erforderlich“-Badge auf deinem Dashboard und werden als gelesen markiert, sobald du die Unterhaltung öffnest.`
    }
  },

  // ─── Lineup ──────────────────────────────────────────────────────────────
  {
    key: 'lineup',
    en: {
      title: 'Lineup',
      subtitle: 'Pick your formation, place your players and choose a captain',
      text: `Your lineup is the foundation of your team's strength. You choose one of 10 formations and fill all 11 positions with matching players on the pitch diagram.

How it works:
• Choose a formation (e.g. 4-4-2, 4-3-3, 3-5-2). Changing the formation clears all current positions.
• Click a position to open the player picker. Only players whose natural position fits the slot can be placed there.
• Set a captain from your starting eleven. If you remove the captain from the lineup, the captain is cleared automatically.
• Suspended players are shown greyed out and cannot be fielded; they are removed from the lineup automatically.
• Sort your bench order – substitutes are pulled from the bench when a player is injured or tired.

Lineup strength:
• The base strength is the sum of all your starters' levels.
• It is then modified by fitness, your captain, a Star Player (+10%), a Motivating Speech (+10%), your squad's average age and your home advantage.

Squad age:
• The ideal average age of your starting eleven is 27 years. A lineup right around 27 gets a small strength bonus (up to +5%).
• The further your average age is from 27 – too young or too old – the smaller that bonus becomes, turning into a penalty of up to −5% for a very young or very old side.
• Aim for a healthy mix of experienced and young players.

Squad rules:
• Your team must always have at least 14 players. You cannot sell or release a player if it would drop you below that.
• Keep at least one goalkeeper, defender, midfielder and attacker on the bench so injured players can be substituted.`
    },
    de: {
      title: 'Aufstellung',
      subtitle: 'Formation wählen, Spieler platzieren und Kapitän bestimmen',
      text: `Deine Aufstellung ist die Grundlage für die Stärke deines Teams. Du wählst eine von 10 Formationen und besetzt alle 11 Positionen mit passenden Spielern auf dem Spielfeld-Diagramm.

So funktioniert es:
• Wähle eine Formation (z. B. 4-4-2, 4-3-3, 3-5-2). Ein Formationswechsel löscht alle aktuellen Positionen.
• Klicke auf eine Position, um die Spielerauswahl zu öffnen. Nur Spieler mit passender Position können dort eingesetzt werden.
• Bestimme einen Kapitän aus deiner Startelf. Entfernst du den Kapitän aus der Aufstellung, wird er automatisch gelöscht.
• Gesperrte Spieler sind ausgegraut und können nicht aufgestellt werden; sie werden automatisch aus der Aufstellung entfernt.
• Sortiere deine Bank – Einwechselspieler werden bei Verletzung oder Müdigkeit von der Bank geholt.

Aufstellungsstärke:
• Die Basisstärke ist die Summe der Level aller Startspieler.
• Sie wird dann durch Fitness, deinen Kapitän, einen Starspieler (+10%), eine Motivationsrede (+10%), das Durchschnittsalter deiner Mannschaft und deinen Heimvorteil verändert.

Durchschnittsalter:
• Das ideale Durchschnittsalter deiner Startelf liegt bei 27 Jahren. Eine Aufstellung nahe 27 erhält einen kleinen Stärke-Bonus (bis zu +5%).
• Je weiter dein Durchschnittsalter von 27 entfernt ist – zu jung oder zu alt –, desto kleiner wird dieser Bonus und schlägt bei einer sehr jungen oder sehr alten Mannschaft in einen Malus von bis zu −5% um.
• Strebe eine gesunde Mischung aus erfahrenen und jungen Spielern an.

Kaderregeln:
• Dein Team muss immer mindestens 14 Spieler haben. Du kannst keinen Spieler verkaufen oder entlassen, wenn du dadurch darunter fällst.
• Halte mindestens einen Torwart, Verteidiger, Mittelfeldspieler und Stürmer auf der Bank, damit verletzte Spieler ersetzt werden können.`
    }
  },

  // ─── Buildings ─────────────────────────────────────────────────────────
  {
    key: 'buildings',
    en: {
      title: 'Buildings',
      subtitle: 'Upgrade your club infrastructure for better cards',
      text: `Your club has three buildings you can upgrade. Each building improves the chance of receiving certain action cards after a match day. You can build only one upgrade at a time, and construction continues across season boundaries.

Training Area – improves Level-Up card chances:
• Level 1: 375,000 € (5 match days)
• Level 2: 1,125,000 € (10 match days)
• Level 3: 3,000,000 € (17 match days) – unlocks the rare Level-Up 100 cards.

Fitness Studio – improves Freshness card chances:
• Level 1: 300,000 € (4 match days)
• Level 2: 900,000 € (8 match days)
• Level 3: 2,625,000 € (15 match days) – unlocks the strong Freshness +20% cards.

Youth Academy – generates new youth players:
• Level 1: every team starts here.
• Level 2: 3,000,000 € (10 match days) – better young talents.
• Level 3: 9,000,000 € (17 match days) – the strongest talents (see Youth Players).

Each building tops out at level 3. The cost is deducted immediately when you start the upgrade, and you get a log message when it is finished.

The 3D view at the top of the page shows your club grounds: it is the same scene as on the stadium page, but centred on the road crossing north-east of the stadium that your buildings are grouped around. Drag to look around, or hand the camera back to the slow auto-orbit with the button in the corner.

Your training area is built there for real – a full-size pitch, as big as the one in your stadium, fenced right up to the kerb. Its level shows:
• Level 1: the fenced pitch with two goals and a pair of small, weak floodlights in two corners, so the far half stays in the dark.
• Level 2: balls, slalom poles and marker cones on the pitch, plus a second, taller and much brighter pair of masts in the other two corners.
• Level 3: full-height masts in all four corners that light the pitch like a match, and a covered coaching shelter at the touchline.`
    },
    de: {
      title: 'Gebäude',
      subtitle: 'Baue deine Vereins-Infrastruktur für bessere Karten aus',
      text: `Dein Verein hat drei Gebäude, die du ausbauen kannst. Jedes Gebäude erhöht die Chance auf bestimmte Action Cards nach einem Spieltag. Du kannst immer nur einen Ausbau gleichzeitig durchführen, und Bauarbeiten laufen über Saisongrenzen hinweg weiter.

Trainingsgelände – verbessert die Chance auf Level-Up-Karten:
• Stufe 1: 375.000 € (5 Spieltage)
• Stufe 2: 1.125.000 € (10 Spieltage)
• Stufe 3: 3.000.000 € (17 Spieltage) – schaltet die seltenen Level-Up-100-Karten frei.

Fitness-Studio – verbessert die Chance auf Frische-Karten:
• Stufe 1: 300.000 € (4 Spieltage)
• Stufe 2: 900.000 € (8 Spieltage)
• Stufe 3: 2.625.000 € (15 Spieltage) – schaltet die starken Frische-+20%-Karten frei.

Jugendakademie – erzeugt neue Jugendspieler:
• Stufe 1: damit startet jedes Team.
• Stufe 2: 3.000.000 € (10 Spieltage) – bessere junge Talente.
• Stufe 3: 9.000.000 € (17 Spieltage) – die stärksten Talente (siehe Jugendspieler).

Jedes Gebäude endet bei Stufe 3. Die Kosten werden sofort beim Start des Ausbaus abgebucht, und du erhältst eine Log-Nachricht, sobald er fertig ist.

Die 3D-Ansicht oben auf der Seite zeigt dein Vereinsgelände: dieselbe Szene wie auf der Stadion-Seite, nur zentriert auf die Straßenkreuzung nordöstlich des Stadions, um die herum deine Gebäude stehen. Zieh mit der Maus, um dich umzusehen, oder gib die Kamera mit dem Knopf in der Ecke wieder an die langsame Drehung ab.

Dein Trainingsgelände steht dort wirklich – ein Platz in voller Größe, genauso groß wie der in deinem Stadion, eingezäunt bis direkt an den Bordstein. Und man sieht ihm seine Stufe an:
• Stufe 1: der eingezäunte Platz mit zwei Toren und einem kleinen, schwachen Flutlicht in zwei Ecken – die andere Hälfte bleibt im Dunkeln.
• Stufe 2: zusätzlich Bälle, Slalomstangen und Hütchen auf dem Platz sowie ein zweites, höheres und deutlich helleres Mastpaar in den beiden anderen Ecken.
• Stufe 3: hohe Masten in allen vier Ecken, die den Platz spielfeldhell ausleuchten, und eine überdachte Trainerbank am Spielfeldrand.`
    }
  },

  // ─── Club Emblem ───────────────────────────────────────────────────────
  {
    key: 'club-emblem',
    en: {
      title: 'Club Emblem',
      subtitle: 'Design the crest that represents your club',
      text: `Every club has its own emblem – an SVG crest made of a shape, a pattern and two colours, with your club name on a banner at the bottom.

Customising your emblem:
• Open the emblem editor to see a live preview while you design.
• Choose from 9 shapes: circle, oval, triangle, several shield variants, crest and pentagon.
• Choose from 6 patterns: solid, vertical stripes, horizontal stripes, quartered, diagonal and halved.
• Pick two colours from a palette of 21. The first colour also becomes your team colour, which is used across the app (for example in tables and result views).

New bot teams get a randomly generated emblem. Your changes are saved instantly with a confirmation.`
    },
    de: {
      title: 'Vereinswappen',
      subtitle: 'Gestalte das Wappen, das deinen Verein repräsentiert',
      text: `Jeder Verein hat sein eigenes Wappen – eine SVG-Grafik aus Form, Muster und zwei Farben, mit deinem Vereinsnamen auf einem Banner am unteren Rand.

Wappen anpassen:
• Öffne den Wappen-Editor und sieh die Vorschau live, während du gestaltest.
• Wähle aus 9 Formen: Kreis, Oval, Dreieck, mehrere Schild-Varianten, Wappen und Fünfeck.
• Wähle aus 6 Mustern: einfarbig, vertikale Streifen, horizontale Streifen, geviertelt, diagonal und halbiert.
• Wähle zwei Farben aus einer Palette von 21. Die erste Farbe wird auch deine Vereinsfarbe und taucht in der ganzen App auf (z. B. in Tabellen und Ergebnisansichten).

Neue Bot-Teams erhalten ein zufällig erzeugtes Wappen. Deine Änderungen werden sofort mit einer Bestätigung gespeichert.`
    }
  },

  // ─── Club Name ─────────────────────────────────────────────────────────
  {
    key: 'club-name',
    en: {
      title: 'Club Name',
      subtitle: 'Choose the name your club plays under',
      text: `Your club name is built from up to three parts: an optional prefix (e.g. 1. FC, AC, SV, RB), an optional middle word (e.g. Dynamo, United, Real, Phoenix) and a city. At least one of the two prefixes must be set.

Changing the name:
• Click your club name in the header to open the name editor.
• Pick the parts from three dropdowns and watch the live preview.
• City names range from real European cities to fictional places, with hundreds of options.

Names must be unique within your game world – if another club already uses a name, you have to pick a different combination. On mobile devices a shortened version (abbreviation plus city) is shown to save space.`
    },
    de: {
      title: 'Vereinsname',
      subtitle: 'Wähle den Namen, unter dem dein Verein spielt',
      text: `Dein Vereinsname besteht aus bis zu drei Teilen: einem optionalen Präfix (z. B. 1. FC, AC, SV, RB), einem optionalen Mittelwort (z. B. Dynamo, United, Real, Phoenix) und einer Stadt. Mindestens einer der beiden Präfix-Teile muss gesetzt sein.

Namen ändern:
• Klicke im Kopfbereich auf deinen Vereinsnamen, um den Namens-Editor zu öffnen.
• Wähle die Teile aus drei Dropdowns und beobachte die Live-Vorschau.
• Die Städtenamen reichen von echten europäischen Städten bis zu fiktiven Orten – mit Hunderten Optionen.

Namen müssen in deiner Spielwelt eindeutig sein – nutzt ein anderer Verein bereits einen Namen, musst du eine andere Kombination wählen. Auf Mobilgeräten wird eine verkürzte Version (Abkürzung plus Stadt) angezeigt, um Platz zu sparen.`
    }
  },

  // ─── Cup ───────────────────────────────────────────────────────────────
  {
    key: 'cup',
    en: {
      title: 'Cup',
      subtitle: 'The season-long knockout competition',
      text: `Alongside the league, every team takes part in the cup – a single-elimination knockout tournament that runs through the season.

Format:
• All real teams qualify automatically.
• Matches are seeded by league level: stronger clubs (higher divisions) may get a bye in the first round so the bracket fits a power of two.
• The cup is played in rounds (round of 64, 32, 16, 8, quarter-final, semi-final, final). Cup match days are scheduled between league match days.

No draws:
• A cup match cannot end level. If the score is tied after 90 minutes, a fixed 30-minute extra time is played.
• If it is still tied after extra time, a penalty shootout decides the winner: five shooters per side (best players first), then sudden death.

Prize money:
• You earn prize money for each round, and it doubles the further you advance.
• Winning the cup pays a 2,000,000 € bonus on top.

The next round is generated automatically once all matches of a round have been played.`
    },
    de: {
      title: 'Pokal',
      subtitle: 'Der saisonbegleitende K.-o.-Wettbewerb',
      text: `Neben der Liga nimmt jedes Team am Pokal teil – einem K.-o.-Turnier, das sich durch die Saison zieht.

Format:
• Alle echten Teams qualifizieren sich automatisch.
• Die Paarungen werden nach Liga-Level gesetzt: stärkere Vereine (höhere Ligen) können in der ersten Runde ein Freilos erhalten, damit das Tableau zu einer Zweierpotenz passt.
• Der Pokal wird in Runden gespielt (Sechzehntel-, Achtel-, Viertel-, Halbfinale, Finale). Pokalspieltage liegen zwischen den Ligaspieltagen.

Kein Unentschieden:
• Ein Pokalspiel kann nicht unentschieden enden. Steht es nach 90 Minuten gleich, wird eine feste 30-minütige Verlängerung gespielt.
• Steht es danach immer noch remis, entscheidet ein Elfmeterschießen: fünf Schützen pro Team (beste Spieler zuerst), danach Sudden Death.

Preisgeld:
• Für jede Runde gibt es Preisgeld, das sich mit jeder weiteren Runde verdoppelt.
• Der Pokalsieg bringt zusätzlich einen Bonus von 2.000.000 €.

Die nächste Runde wird automatisch erzeugt, sobald alle Spiele einer Runde gespielt wurden.`
    }
  },

  // ─── Fair Play ─────────────────────────────────────────────────────────
  {
    key: 'fair-play',
    en: {
      title: 'Fair Play',
      subtitle: 'The rules every manager plays by',
      text: `FootballManager.IO is a competition between managers. It only works when everyone runs exactly one club and earns their money in the game. These rules apply to every account.

One account per person:
• A second account is not allowed. Every manager controls exactly one club.
• Sharing your account, taking over someone else's club or handing yours over is not allowed either.
• Playing from the same home or network is fine – a family member or flatmate with their own club is welcome. What is not fine is one person running two clubs.

No arranged transfers:
• A transfer must reflect what a player is worth. Selling far below or buying far above the market value to move money between clubs is not allowed.
• Offers below 75% of a player's market value are blocked automatically – on the selling side and on the buying side.
• Clubs that keep trading players back and forth with each other are flagged for review.

How this is checked:
• Suspicious patterns are detected automatically: accounts used from the same device or network, transfer prices far off the market value, pairs of clubs trading unusually often, action cards that are always won by the same club seconds after being listed, and invitation rewards claimed by the inviter themselves.
• Every flag is reviewed by a human admin. Being flagged is not a verdict – normal situations like two friends in the same flat show up too.
• Confirmed cheating can cost you your club: an admin can block your email address or delete the account. A blocked address can no longer log in or register, and any open session ends immediately.

If you are unsure whether something is allowed – for example because you and a friend share a WiFi connection – say so in the forum before it looks suspicious.`
    },
    de: {
      title: 'Fair Play',
      subtitle: 'Die Regeln, nach denen alle Manager spielen',
      text: `FootballManager.IO ist ein Wettbewerb zwischen Managern. Das funktioniert nur, wenn jeder genau einen Verein führt und sein Geld im Spiel verdient. Diese Regeln gelten für jeden Account.

Ein Account pro Person:
• Ein Zweit-Account ist nicht erlaubt. Jeder Manager führt genau einen Verein.
• Auch das Teilen deines Accounts, die Übernahme eines fremden Vereins oder die Weitergabe deines eigenen ist nicht erlaubt.
• Aus demselben Haushalt oder Netzwerk zu spielen ist in Ordnung – ein Familienmitglied oder Mitbewohner mit eigenem Verein ist willkommen. Nicht in Ordnung ist es, wenn eine Person zwei Vereine führt.

Keine abgesprochenen Transfers:
• Ein Transfer muss dem Wert eines Spielers entsprechen. Weit unter Wert zu verkaufen oder weit über Wert zu kaufen, um Geld zwischen Vereinen zu verschieben, ist nicht erlaubt.
• Angebote unter 75% des Marktwerts werden automatisch blockiert – auf der Verkäufer- wie auf der Käuferseite.
• Vereine, die Spieler immer wieder untereinander hin- und herschieben, werden zur Prüfung markiert.

Wie das geprüft wird:
• Verdächtige Muster werden automatisch erkannt: Accounts vom selben Gerät oder Netzwerk, Transferpreise weit abseits des Marktwerts, Vereinspaare mit auffällig vielen Transfers, Action Cards, die immer wieder Sekunden nach dem Einstellen vom selben Verein gekauft werden, und Einladungs-Belohnungen, die sich jemand selbst gutschreibt.
• Jede Markierung wird von einem Admin persönlich geprüft. Markiert zu sein ist kein Urteil – auch normale Fälle wie zwei Freunde in einer WG tauchen dort auf.
• Bestätigtes Cheating kann dich deinen Verein kosten: Ein Admin kann deine E-Mail-Adresse sperren oder den Account löschen. Mit einer gesperrten Adresse sind Login und Registrierung nicht mehr möglich, eine offene Sitzung endet sofort.

Wenn du unsicher bist, ob etwas erlaubt ist – zum Beispiel weil du dir mit einem Freund das WLAN teilst – sag es im Forum, bevor es verdächtig aussieht.`
    }
  },

  // ─── Finances ──────────────────────────────────────────────────────────
  {
    key: 'finances',
    en: {
      title: 'Finances',
      subtitle: 'Where your money comes from and where it goes',
      text: `Your account balance changes after almost every match day. The finance page shows your full transaction history with the reason, amount and running balance, filterable by season and match day.

Income:
• Ticket sales – your home games earn money from all four stands, depending on attendance and ticket prices (see Stadium).
• Sponsor money – paid every match day while you have an active sponsor (see Sponsors).
• TV money – a single payout at the end of the season based on your final league position (see TV Money).
• Player sales – you receive the agreed fee when you sell a player.

Expenses:
• Player salaries – paid every match day for your whole squad. Salaries grow exponentially with player level (see Players).
• Stadium expansion and building upgrades – deducted immediately when you order the work.
• Player purchases – the agreed fee is paid when your offer is accepted.

Tip: Salaries are a constant drain, so balance a strong squad against running costs.`
    },
    de: {
      title: 'Finanzen',
      subtitle: 'Woher dein Geld kommt und wohin es geht',
      text: `Dein Kontostand ändert sich nach fast jedem Spieltag. Die Finanzseite zeigt deine komplette Transaktionshistorie mit Grund, Betrag und laufendem Kontostand – filterbar nach Saison und Spieltag.

Einnahmen:
• Ticketverkäufe – deine Heimspiele bringen Geld aus allen vier Tribünen, abhängig von Zuschauern und Ticketpreisen (siehe Stadion).
• Sponsorengeld – wird an jedem Spieltag gezahlt, solange du einen aktiven Sponsor hast (siehe Sponsoren).
• TV-Gelder – eine einmalige Auszahlung am Saisonende, abhängig von deiner Abschlussplatzierung (siehe TV-Gelder).
• Spielerverkäufe – du erhältst die vereinbarte Ablöse, wenn du einen Spieler verkaufst.

Ausgaben:
• Spielergehälter – werden an jedem Spieltag für den gesamten Kader gezahlt. Die Gehälter steigen exponentiell mit dem Spielerlevel (siehe Spieler).
• Stadionausbau und Gebäude-Upgrades – werden sofort beim Auftrag abgebucht.
• Spielerkäufe – die vereinbarte Ablöse wird gezahlt, sobald dein Angebot angenommen wird.

Tipp: Gehälter sind eine ständige Belastung – wäge einen starken Kader gegen die laufenden Kosten ab.`
    }
  },

  // ─── Friendlies ──────────────────────────────────────────────────────────
  {
    key: 'friendlies',
    en: {
      title: 'Friendly Matches',
      subtitle: 'Test your squad against any team, any time',
      text: `Friendly matches let you play an extra game whenever you like – to try out a lineup, a formation or new tactics without any league or cup consequences.

How it works:
• You can start one friendly per match day (the 12-hour slot between calculations). You can still be picked as someone else's opponent on top of that.
• Choose a specific opponent from any team in the game, or let the game pick a random one for you.
• The result is calculated instantly with the same match engine as league games (see Match Simulation), so it is a realistic test of your strength.

What friendlies do and don't affect:
• They do NOT change league standings, cup progress, points or suspensions.
• Your players lose about half the fitness of a league game; your opponent loses none (they didn't choose to play).
• Suspended players sit out, but their suspension is not used up.
• As the home team you still earn ticket money – about half a normal match's attendance.

Use friendlies to keep match practice up between fixtures and to experiment safely before it counts.`
    },
    de: {
      title: 'Friendlies',
      subtitle: 'Teste deinen Kader jederzeit gegen jedes Team',
      text: `Freundschaftsspiele lassen dich jederzeit ein zusätzliches Spiel austragen – um eine Aufstellung, eine Formation oder neue Taktiken auszuprobieren, ganz ohne Folgen für Liga oder Pokal.

So funktioniert es:
• Du kannst ein Freundschaftsspiel pro Spieltag starten (der 12-Stunden-Slot zwischen den Berechnungen). Zusätzlich kannst du weiterhin als Gegner eines anderen Teams ausgewählt werden.
• Wähle einen bestimmten Gegner aus allen Teams des Spiels aus oder lass das Spiel einen zufälligen Gegner bestimmen.
• Das Ergebnis wird sofort mit derselben Spiel-Engine wie Ligaspiele berechnet (siehe Spielberechnung) – ein realistischer Test deiner Stärke.

Was Freundschaftsspiele beeinflussen und was nicht:
• Sie ändern NICHT Tabelle, Pokalverlauf, Punkte oder Sperren.
• Deine Spieler verlieren etwa halb so viel Fitness wie in einem Ligaspiel; dein Gegner verliert keine (er hat das Spiel nicht gewählt).
• Gesperrte Spieler pausieren, ihre Sperre wird aber nicht abgesessen.
• Als Heimteam erhältst du weiterhin Ticketeinnahmen – etwa die Hälfte der Zuschauer eines normalen Spiels.

Nutze Freundschaftsspiele, um zwischen den Spieltagen im Rhythmus zu bleiben und gefahrlos zu experimentieren, bevor es zählt.`
    }
  },

  // ─── Forum ─────────────────────────────────────────────────────────────
  {
    key: 'forum',
    en: {
      title: 'Forum',
      subtitle: 'The community board for discussion and news',
      text: `The forum is the community space of the game. It is split into categories, each containing threads you can read and reply to.

What you can do:
• Create posts with a title, text (up to 5,000 characters) and up to 5 images per post.
• Comment on posts (up to 1,000 characters, also with up to 5 images).
• Like and unlike posts.
• Click an image thumbnail to open it full size.

Images:
• Supported formats: JPEG, PNG, GIF and WebP, up to 2 MB each.
• You see a preview before posting and can remove individual images.

Moderation: Posts are automatically filtered for offensive language. Admins manage the categories and can remove posts or comments. The "News" category is reserved for official announcements.`
    },
    de: {
      title: 'Forum',
      subtitle: 'Das Community-Board für Austausch und News',
      text: `Das Forum ist der Community-Bereich des Spiels. Es ist in Kategorien unterteilt, die jeweils Beiträge enthalten, die du lesen und beantworten kannst.

Das kannst du tun:
• Beiträge mit Titel, Text (bis 5.000 Zeichen) und bis zu 5 Bildern pro Beitrag erstellen.
• Beiträge kommentieren (bis 1.000 Zeichen, ebenfalls mit bis zu 5 Bildern).
• Beiträge liken und das Like wieder entfernen.
• Auf ein Bild-Vorschaubild klicken, um es in voller Größe zu öffnen.

Bilder:
• Unterstützte Formate: JPEG, PNG, GIF und WebP, jeweils bis 2 MB.
• Vor dem Posten siehst du eine Vorschau und kannst einzelne Bilder wieder entfernen.

Moderation: Beiträge werden automatisch auf anstößige Sprache gefiltert. Admins verwalten die Kategorien und können Beiträge oder Kommentare entfernen. Die Kategorie „News“ ist offiziellen Ankündigungen vorbehalten.`
    }
  },

  // ─── Friends ───────────────────────────────────────────────────────────
  {
    key: 'friends',
    en: {
      title: 'Friends',
      subtitle: 'Add other managers and follow their posts',
      text: `You can add other managers as friends to keep up with them and share posts.

Friendships:
• Adding someone sends a one-way connection. If you both add each other, you become mutual friends.
• Your friend list shows each friend's username, avatar, club name and team level.
• Removing a friend clears the connection in both directions.

Friend posts:
• You see a feed of posts from yourself and everyone you have added.
• A post can contain text (up to 5,000 characters) and one optional image (JPEG, PNG, GIF or WebP, up to 2 MB).
• You can like and comment on posts (comments up to 1,000 characters).
• Authors – and admins – can delete posts.

The friends overview also shows each friend's league position and their last match result for a bit of context.`
    },
    de: {
      title: 'Freunde',
      subtitle: 'Füge andere Manager hinzu und folge ihren Beiträgen',
      text: `Du kannst andere Manager als Freunde hinzufügen, um auf dem Laufenden zu bleiben und Beiträge zu teilen.

Freundschaften:
• Jemanden hinzuzufügen erzeugt eine einseitige Verbindung. Fügt ihr euch gegenseitig hinzu, werdet ihr beidseitige Freunde.
• Deine Freundesliste zeigt zu jedem Freund Benutzername, Avatar, Vereinsname und Team-Level.
• Entfernst du einen Freund, wird die Verbindung in beide Richtungen gelöscht.

Freundes-Beiträge:
• Du siehst einen Feed mit Beiträgen von dir selbst und allen, die du hinzugefügt hast.
• Ein Beitrag kann Text (bis 5.000 Zeichen) und ein optionales Bild enthalten (JPEG, PNG, GIF oder WebP, bis 2 MB).
• Du kannst Beiträge liken und kommentieren (Kommentare bis 1.000 Zeichen).
• Autoren – und Admins – können Beiträge löschen.

Die Freundesübersicht zeigt außerdem die Tabellenposition jedes Freundes und dessen letztes Spielergebnis als kleinen Kontext.`
    }
  },

  // ─── Leagues ───────────────────────────────────────────────────────────
  {
    key: 'leagues',
    en: {
      title: 'Leagues',
      subtitle: 'The division pyramid, promotion and relegation',
      text: `The game world is organised as a league pyramid. Level 1 is the top division; below it the number of parallel leagues doubles at each level (2 at level 2, 4 at level 3, and so on), so there is room for everyone.

Structure:
• Every league has exactly 18 teams.
• A season runs over 34 match days – each team plays every opponent home and away.
• Points: 3 for a win, 1 for a draw, 0 for a loss. Ties are broken by goal difference, then goals scored.
• The standings are updated after every match day.

Promotion and relegation (at season end):
• The top 2 teams of each league are promoted one level up.
• The bottom 4 teams of each league are relegated one level down.
• Teams in the top division cannot be promoted; teams in the lowest open level cannot be relegated further.

Promotion and relegation run automatically when the last match day of the season has been played, and you receive a log message about the outcome.`
    },
    de: {
      title: 'Ligen',
      subtitle: 'Die Liga-Pyramide, Auf- und Abstieg',
      text: `Die Spielwelt ist als Liga-Pyramide aufgebaut. Stufe 1 ist die höchste Spielklasse; darunter verdoppelt sich die Zahl der parallelen Ligen je Stufe (2 auf Stufe 2, 4 auf Stufe 3 usw.), sodass für alle Platz ist.

Aufbau:
• Jede Liga hat genau 18 Teams.
• Eine Saison läuft über 34 Spieltage – jedes Team spielt gegen jeden Gegner zu Hause und auswärts.
• Punkte: 3 für einen Sieg, 1 für ein Unentschieden, 0 für eine Niederlage. Bei Gleichstand entscheiden Tordifferenz, dann erzielte Tore.
• Die Tabelle wird nach jedem Spieltag aktualisiert.

Auf- und Abstieg (am Saisonende):
• Die besten 2 Teams jeder Liga steigen eine Stufe auf.
• Die letzten 4 Teams jeder Liga steigen eine Stufe ab.
• Teams in der höchsten Liga können nicht aufsteigen; Teams in der untersten geöffneten Stufe können nicht weiter absteigen.

Auf- und Abstieg laufen automatisch ab, sobald der letzte Spieltag der Saison gespielt wurde, und du erhältst eine Log-Nachricht über das Ergebnis.`
    }
  },

  // ─── Match Day ─────────────────────────────────────────────────────────
  {
    key: 'match-day',
    en: {
      title: 'Match Day',
      subtitle: 'When games are played and what happens around them',
      text: `Matches are calculated automatically twice a day – at midnight and at noon. Each calculation is a match day, so the world moves forward in 12-hour steps.

What happens on a match day:
• League matches are played first, then cup matches.
• Each match is simulated step by step (see Match Simulation), and the result is stored right away.
• Afterwards the system settles everything around the games: standings are updated, suspensions are served, salaries are paid, sponsor money and ticket income are booked, injured players recover a little, fitness is restored, youth players train and action cards are handed out.

A few details:
• If a team cannot field at least 7 players, it forfeits 0:3.
• At the end of a season, the match-day slot is used to prepare the next season (promotions, relegations, new fixtures) instead of playing games.
• Push notifications keep you informed when your matches are done.`
    },
    de: {
      title: 'Spieltag',
      subtitle: 'Wann gespielt wird und was rundherum passiert',
      text: `Spiele werden automatisch zweimal täglich berechnet – um Mitternacht und um die Mittagszeit. Jede Berechnung ist ein Spieltag, die Welt rückt also in 12-Stunden-Schritten voran.

Was an einem Spieltag passiert:
• Zuerst werden die Ligaspiele gespielt, danach die Pokalspiele.
• Jedes Spiel wird Schritt für Schritt simuliert (siehe Spielberechnung), und das Ergebnis wird sofort gespeichert.
• Danach wickelt das System alles rund um die Spiele ab: Tabellen werden aktualisiert, Sperren abgesessen, Gehälter gezahlt, Sponsorengeld und Ticketeinnahmen verbucht, verletzte Spieler erholen sich etwas, Fitness wird aufgefüllt, Jugendspieler trainieren und Action Cards werden verteilt.

Ein paar Details:
• Kann ein Team nicht mindestens 7 Spieler stellen, verliert es kampflos mit 0:3.
• Am Saisonende wird der Spieltag-Slot genutzt, um die nächste Saison vorzubereiten (Auf- und Abstiege, neue Spielpläne), statt Spiele auszutragen.
• Push-Benachrichtigungen halten dich auf dem Laufenden, wenn deine Spiele fertig sind.`
    }
  },

  // ─── Match Simulation ──────────────────────────────────────────────────
  {
    key: 'match-simulation',
    en: {
      title: 'Match Simulation',
      subtitle: 'How a match result is calculated step by step',
      text: `Every match is simulated in about 900 steps (90 minutes, 10 steps per minute) plus a little stoppage time. In each step the engine decides whether the ball is passed, contested, or shot at goal. The results are tuned to resemble real Bundesliga statistics (around 3.2 goals per game).

The key mechanics:
• Ball contests – a player fights an opponent for the ball. The win chance is your level divided by the combined levels of both players. An aggressive play style adds a bonus, friendly subtracts one.
• Shots – attackers shoot most often, midfielders less, defenders rarely. Winning several duels in a row builds a streak that raises the shot chance.
• Goalkeeper saves – a higher keeper level makes a save more likely.
• Passing – your attack mode controls how often you pass forward. Only forward passes can be intercepted, and stronger players are harder to intercept.
• Cards – yellow and red cards depend on play style; an aggressive style means more cards (see Players and Tactics).

What changes a player's effective strength: fitness, a Star Player bonus (+10%), a Motivating Speech (+10%), your captain, your squad's average age (ideal 27, up to ±5%), your home advantage, and a small penalty for bot teams (see In-Game Level for the full picture). Cup matches never end in a draw – if it stays level after 90 minutes, 30 minutes of extra time are played, followed by a penalty shootout if still tied.

Each match stores full details: goals, shots, possession, cards and the lineups, which you can review afterwards.`
    },
    de: {
      title: 'Spielberechnung',
      subtitle: 'Wie ein Spielergebnis Schritt für Schritt entsteht',
      text: `Jedes Spiel wird in rund 900 Schritten simuliert (90 Minuten, 10 Schritte pro Minute) plus etwas Nachspielzeit. In jedem Schritt entscheidet die Engine, ob der Ball gepasst, umkämpft oder aufs Tor geschossen wird. Die Ergebnisse sind so abgestimmt, dass sie echten Bundesliga-Statistiken ähneln (rund 3,2 Tore pro Spiel).

Die wichtigsten Mechaniken:
• Zweikämpfe – ein Spieler kämpft mit einem Gegner um den Ball. Die Gewinnchance ist dein Level geteilt durch die Summe der Level beider Spieler. Ein aggressiver Spielstil gibt einen Bonus, ein freundlicher einen Malus.
• Schüsse – Stürmer schießen am häufigsten, Mittelfeldspieler seltener, Verteidiger kaum. Mehrere gewonnene Zweikämpfe in Folge bilden eine Serie, die die Schusschance erhöht.
• Torwart-Paraden – ein höheres Torwart-Level macht eine Parade wahrscheinlicher.
• Pässe – dein Angriffsmodus steuert, wie oft nach vorne gespielt wird. Nur Vorwärtspässe können abgefangen werden, und stärkere Spieler sind schwerer abzufangen.
• Karten – Gelbe und Rote Karten hängen vom Spielstil ab; aggressiv bedeutet mehr Karten (siehe Spieler und Taktik).

Was die effektive Stärke eines Spielers verändert: Fitness, der Starspieler-Bonus (+10%), eine Motivationsrede (+10%), dein Kapitän, das Durchschnittsalter deiner Mannschaft (ideal 27, bis zu ±5%), dein Heimvorteil und ein kleiner Malus für Bot-Teams (siehe In-Game-Level für die vollständige Übersicht). Pokalspiele enden nie unentschieden – ist es nach 90 Minuten remis, folgt eine 30-minütige Verlängerung und, wenn immer noch gleich, ein Elfmeterschießen.

Jedes Spiel speichert alle Details: Tore, Schüsse, Ballbesitz, Karten und die Aufstellungen, die du danach ansehen kannst.`
    }
  },

  // ─── In-Game Level ──────────────────────────────────────────────────────
  {
    key: 'in-game-level',
    en: {
      title: 'In-Game Level',
      subtitle: 'The player level actually used inside a match',
      text: `Your players have a base level from 1 to 100. The level that actually enters the match simulation – the "in-game level" (shown as IG in the squad list of a match report) – is different: it is the base level multiplied by every strength modifier that applies to that match.

Modifiers that raise or lower the in-game level:
• Fitness (freshness): a player at 60% freshness plays at 60% of their level. Low fitness hurts a lot.
• Star Player: permanent +10% for a player promoted with a Star Player card.
• Motivating Speech: +10% for the whole team on the next match day only.
• Captain: your captain's leadership adjusts the whole squad's strength (see Lineup).
• Squad age: an average age near 27 gives up to +5%; too young or too old costs up to −5%.
• Home advantage: a well-filled home stadium boosts the home side; an empty stadium is a small penalty.
• Bot penalty: bot teams play at 90% of their nominal level.
• Out of position: a starter fielded away from their natural position plays at 50% level. Substitutes are the exception – a player brought on from the bench keeps their full level even in a foreign slot, so an emergency swap is never punished.

Where to see it:
• After a match, the squad list shows each starter's base level ("Lvl") and their in-game level ("IG"). Green means the modifiers raised the level, red means they lowered it.
• The lineup preview shows the effective strength you will bring to the pitch, based on the same modifiers (except Motivating Speech, which only applies the next match day).`
    },
    de: {
      title: 'In-Game-Level',
      subtitle: 'Das Spieler-Level, das wirklich ins Spiel geht',
      text: `Deine Spieler haben ein Basis-Level von 1 bis 100. Das Level, das tatsächlich in die Spielberechnung geht – das "In-Game-Level" (in der Kaderliste des Spielberichts als "IG" angezeigt) – ist aber ein anderes: Es ist das Basis-Level multipliziert mit allen Modifikatoren, die auf dieses Spiel wirken.

Was das In-Game-Level verändert:
• Fitness (Frische): Ein Spieler mit 60% Frische spielt mit 60% seines Levels. Niedrige Fitness kostet richtig viel.
• Starspieler: Dauerhafte +10% für einen mit einer Starspieler-Karte veredelten Spieler.
• Motivationsrede: +10% für das ganze Team, aber nur am nächsten Spieltag.
• Kapitän: Die Führungsstärke deines Kapitäns beeinflusst die gesamte Mannschaftsstärke (siehe Aufstellung).
• Durchschnittsalter: Ein Schnitt um 27 gibt bis zu +5%; zu jung oder zu alt kostet bis zu −5%.
• Heimvorteil: Ein gut gefülltes Heimstadion stärkt die Heimmannschaft; ein leeres Stadion ist ein kleiner Malus.
• Bot-Malus: Bot-Teams spielen mit 90% ihres nominalen Levels.
• Falsche Position: Ein Starter, der abseits seiner natürlichen Position aufläuft, spielt nur mit 50% Level. Einwechselspieler sind die Ausnahme – ein von der Bank gebrachter Spieler behält sein volles Level auch auf einer fremden Position, ein Not-Wechsel wird also nie bestraft.

Wo du es siehst:
• Nach jedem Spiel zeigt die Kaderliste für jeden Starter das Basis-Level ("Lvl") und das In-Game-Level ("IG"). Grün bedeutet, die Modifikatoren haben das Level angehoben, Rot bedeutet, sie haben es gesenkt.
• Die Aufstellungs-Vorschau zeigt die effektive Stärke, mit der du aufs Feld gehst – basierend auf denselben Modifikatoren (außer der Motivationsrede, die erst am nächsten Spieltag greift).`
    }
  },

  // ─── Players ───────────────────────────────────────────────────────────
  {
    key: 'players',
    en: {
      title: 'Players',
      subtitle: 'Level, fitness, injuries, salary and suspensions',
      text: `Your players are described by a level, a position and a fitness value, and several effects shape how useful they are.

Level and position:
• Level ranges from 1 to 100 and is the core of a player's strength.
• Positions are goalkeeper, defenders, midfielders and attackers; a player can only be fielded in a matching slot.
• A career lasts roughly 20 to 23 years.

Fitness (freshness):
• Shown as a percentage. Green is good (70%+), yellow is medium, red is low (below 40%).
• A match lowers fitness (more with an aggressive play style); players recover each match day, and benched players recover faster. Younger players recover quicker than older ones.
• Low fitness directly reduces a player's effective strength, so rotate your squad.

Injuries:
• Players can get injured during matches – the risk rises sharply when fitness is low and with an aggressive play style.
• Injuries range from a 1-day bruise to a long-term cruciate ligament or Achilles rupture. Injured starters are substituted automatically (keep a balanced bench).

Salary:
• Salaries grow exponentially with level – from about 150 € per day at level 1 to about 10,308 € at level 100, roughly doubling every 10 levels. They are paid every match day.

Suspensions:
• A second yellow card in a match means a red card. Five yellow cards across the season also trigger a one-match ban. Bans always last exactly one match and are served automatically on the next match day.`
    },
    de: {
      title: 'Spieler',
      subtitle: 'Level, Fitness, Verletzungen, Gehalt und Sperren',
      text: `Deine Spieler werden durch ein Level, eine Position und einen Fitnesswert beschrieben, und mehrere Effekte bestimmen, wie nützlich sie sind.

Level und Position:
• Das Level reicht von 1 bis 100 und ist der Kern der Spielerstärke.
• Positionen sind Torwart, Verteidiger, Mittelfeldspieler und Stürmer; ein Spieler kann nur auf einer passenden Position eingesetzt werden.
• Eine Karriere dauert etwa 20 bis 23 Jahre.

Fitness (Frische):
• Wird in Prozent angezeigt. Grün ist gut (ab 70%), Gelb mittel, Rot niedrig (unter 40%).
• Ein Spiel senkt die Fitness (stärker bei aggressivem Spielstil); Spieler erholen sich an jedem Spieltag, Bankspieler schneller. Jüngere Spieler regenerieren schneller als ältere.
• Niedrige Fitness senkt die effektive Stärke direkt – rotiere also deinen Kader.

Verletzungen:
• Spieler können sich im Spiel verletzen – das Risiko steigt stark bei niedriger Fitness und aggressivem Spielstil.
• Verletzungen reichen von einer 1-tägigen Prellung bis zu langwierigem Kreuzband- oder Achillessehnenriss. Verletzte Startspieler werden automatisch ausgewechselt (halte eine ausgewogene Bank).

Gehalt:
• Gehälter steigen exponentiell mit dem Level – von etwa 150 € pro Tag auf Level 1 bis rund 10.308 € auf Level 100, etwa eine Verdopplung alle 10 Level. Sie werden an jedem Spieltag gezahlt.

Sperren:
• Eine zweite Gelbe Karte im Spiel bedeutet Rot. Fünf Gelbe Karten über die Saison lösen ebenfalls eine Sperre von einem Spiel aus. Sperren dauern immer genau ein Spiel und werden am nächsten Spieltag automatisch abgesessen.`
    }
  },

  // ─── Profile Picture ───────────────────────────────────────────────────
  {
    key: 'profile-picture',
    en: {
      title: 'Profile Picture',
      subtitle: 'Set the avatar shown next to your name',
      text: `You can upload a profile picture (avatar) that appears next to your name across the game – on your profile, in friend lists, friend posts and search results.

How it works:
• Upload an image from your profile settings.
• Supported formats: JPEG, PNG and WebP, up to 5 MB.
• The image is automatically cropped to a centred square and resized to 256×256 pixels.
• Uploading a new picture replaces the old one. You can also remove your avatar entirely.`
    },
    de: {
      title: 'Profilbild',
      subtitle: 'Lege den Avatar fest, der neben deinem Namen erscheint',
      text: `Du kannst ein Profilbild (Avatar) hochladen, das im ganzen Spiel neben deinem Namen erscheint – auf deinem Profil, in Freundeslisten, Freundes-Beiträgen und Suchergebnissen.

So funktioniert es:
• Lade ein Bild in deinen Profileinstellungen hoch.
• Unterstützte Formate: JPEG, PNG und WebP, bis 5 MB.
• Das Bild wird automatisch mittig auf ein Quadrat zugeschnitten und auf 256×256 Pixel verkleinert.
• Ein neues Bild ersetzt das alte. Du kannst deinen Avatar auch komplett entfernen.`
    }
  },

  // ─── Schedule ────────────────────────────────────────────────────────────
  {
    key: 'schedule',
    en: {
      title: 'Schedule',
      subtitle: 'Your upcoming and past fixtures at a glance',
      text: `The schedule shows all of your team's fixtures for the current season in the order they are played – league match days and cup rounds combined into one timeline.

What you see:
• A label for each entry marks whether it is a league match day or a cup round.
• For played games you see the final score; click a result to open the full match report.
• For upcoming games a countdown shows how long until kick-off (days, or hours and minutes when it's close).
• Cup rounds you are not (yet) part of appear as placeholders, since qualification depends on earlier results.

Good to know:
• Games are calculated twice a day, at midnight and at noon (see Match Day), so the timeline moves forward in 12-hour steps.
• League fixtures are fixed for the whole season; cup pairings are drawn round by round as the competition unfolds (see Cup).

Use the schedule to plan your lineup, tactics and fitness ahead of important matches.`
    },
    de: {
      title: 'Spielplan',
      subtitle: 'Deine kommenden und vergangenen Spiele auf einen Blick',
      text: `Der Spielplan zeigt alle Spiele deines Teams in der aktuellen Saison in der Reihenfolge, in der sie ausgetragen werden – Liga-Spieltage und Pokalrunden in einer gemeinsamen Zeitleiste.

Was du siehst:
• Eine Markierung zu jedem Eintrag zeigt, ob es sich um einen Liga-Spieltag oder eine Pokalrunde handelt.
• Bei gespielten Partien siehst du das Endergebnis; klicke auf ein Ergebnis, um den vollständigen Spielbericht zu öffnen.
• Bei kommenden Spielen zeigt ein Countdown die Zeit bis zum Anpfiff (Tage oder Stunden und Minuten, wenn es knapp wird).
• Pokalrunden, an denen du (noch) nicht teilnimmst, erscheinen als Platzhalter, da die Qualifikation von früheren Ergebnissen abhängt.

Gut zu wissen:
• Spiele werden zweimal täglich berechnet, um Mitternacht und um die Mittagszeit (siehe Spieltag), die Zeitleiste rückt also in 12-Stunden-Schritten voran.
• Der Ligaspielplan steht für die ganze Saison fest; Pokalpaarungen werden Runde für Runde ausgelost, während der Wettbewerb läuft (siehe Pokal).

Nutze den Spielplan, um Aufstellung, Taktik und Fitness rechtzeitig vor wichtigen Spielen zu planen.`
    }
  },

  // ─── Search ────────────────────────────────────────────────────────────
  {
    key: 'search',
    en: {
      title: 'Search',
      subtitle: 'Find players, teams and other managers',
      text: `The search lets you look up players, teams and other managers from the main navigation.

What you can search:
• Players by name – shows the player and the team they belong to, sortable by name, position, level, age and more.
• Teams by name – sortable by name and level.
• Users by username – shows avatar, club, league position and last login.

How to use it:
• Type at least 3 characters; quick results appear as you type.
• Switch between Users, Players and Teams with the dropdown.
• Choose "Show all" for the full, paginated and sortable browse view. Your active tab and query are kept in the URL so you can share or bookmark a search.`
    },
    de: {
      title: 'Suche',
      subtitle: 'Finde Spieler, Teams und andere Manager',
      text: `Über die Suche kannst du aus der Hauptnavigation Spieler, Teams und andere Manager nachschlagen.

Was du suchen kannst:
• Spieler nach Name – zeigt den Spieler und sein Team, sortierbar nach Name, Position, Level, Alter und mehr.
• Teams nach Name – sortierbar nach Name und Level.
• Benutzer nach Benutzername – zeigt Avatar, Verein, Tabellenposition und letzte Anmeldung.

So nutzt du sie:
• Gib mindestens 3 Zeichen ein; während des Tippens erscheinen Schnellergebnisse.
• Wechsle mit dem Dropdown zwischen Benutzern, Spielern und Teams.
• Wähle „Alle anzeigen“ für die vollständige, seitenweise und sortierbare Übersicht. Der aktive Tab und deine Suche bleiben in der URL erhalten, sodass du eine Suche teilen oder als Lesezeichen speichern kannst.`
    }
  },

  // ─── Sponsors ──────────────────────────────────────────────────────────
  {
    key: 'sponsors',
    en: {
      title: 'Sponsors',
      subtitle: 'Sign a sponsor for steady match-day income',
      text: `A sponsor pays your club money on every match day. You can have one active sponsor at a time, and contracts do not renew automatically.

Choosing a sponsor:
• You are offered deals over different durations: 3, 9, 16 and 34 match days (a full season).
• The offer value rises with your recent win rate, so a winning streak earns you better deals.
• Offers are refreshed periodically, so it pays to check back.

How the payout works:
• The base payout is reduced in lower leagues (each level below the top division pays less).
• It scales with your win rate over the contract – winning more games pays more, with a guaranteed minimum of one third of the base.
• A small random factor (about 90–110%) adds variation.

The money is booked automatically after each match day.`
    },
    de: {
      title: 'Sponsoren',
      subtitle: 'Schließe einen Sponsor für stetige Spieltags-Einnahmen ab',
      text: `Ein Sponsor zahlt deinem Verein an jedem Spieltag Geld. Du kannst immer einen aktiven Sponsor haben, und Verträge verlängern sich nicht automatisch.

Sponsor wählen:
• Du erhältst Angebote über verschiedene Laufzeiten: 3, 9, 16 und 34 Spieltage (eine ganze Saison).
• Der Angebotswert steigt mit deiner jüngsten Siegquote – eine Siegesserie bringt dir also bessere Angebote.
• Angebote werden regelmäßig erneuert, ein erneuter Blick lohnt sich.

So funktioniert die Auszahlung:
• Die Basisauszahlung ist in niedrigeren Ligen reduziert (jede Stufe unter der höchsten Liga zahlt weniger).
• Sie skaliert mit deiner Siegquote über den Vertrag – mehr Siege zahlen mehr, mit einem garantierten Minimum von einem Drittel der Basis.
• Ein kleiner Zufallsfaktor (etwa 90–110%) sorgt für Schwankung.

Das Geld wird nach jedem Spieltag automatisch verbucht.`
    }
  },

  // ─── Stadium ───────────────────────────────────────────────────────────
  {
    key: 'stadium',
    en: {
      title: 'Stadium',
      subtitle: 'Expand your ground and set ticket prices',
      text: `Your stadium earns ticket money at every home game and even gives a small boost to your team. It has four main stands (north, south, east and west) plus four corner stands (NE, NW, SE and SW) that you can expand individually.

Capacity and expansion:
• North and south stands hold up to 30,000 seats each; east and west up to 15,000 each; each corner stand holds up to 4,000.
• Seats get more expensive in tiers as you build bigger (from 500 € per seat up to 2,000 € for the largest stands), plus a one-time 50,000 € architect fee per build order.
• You can add a roof to a stand, which raises attendance. A new roof costs 20 % on top of the stand's build price (at least 300,000 €).
• Expanding a roofed stand means the roof has to be extended over the new seats — that costs 20 % of the added seats' price (at least 100,000 €). You can also tear an existing roof down instead, which is free.
• Stands cannot be shrunk.
• Construction takes several match days and continues across seasons.

Attendance and income:
• Attendance per stand depends on both teams' strength, your ticket price and whether the stand has a roof.
• Ticket prices can be set per stand from 1 to 100 €. Around 15 € tends to be the sweet spot – too high and fans stay away.

Home advantage:
• A well-filled stadium boosts your team strength by up to +10% (more fans, more boost), while a stadium below 50% capacity gives a penalty of up to −10%.`
    },
    de: {
      title: 'Stadion',
      subtitle: 'Baue dein Stadion aus und lege Ticketpreise fest',
      text: `Dein Stadion bringt bei jedem Heimspiel Ticketeinnahmen und gibt deinem Team sogar einen kleinen Schub. Es hat vier Haupttribünen (Nord, Süd, Ost und West) sowie vier Ecktribünen (NO, NW, SO und SW), die du einzeln ausbauen kannst.

Kapazität und Ausbau:
• Nord- und Südtribüne fassen jeweils bis zu 30.000 Plätze; Ost und West jeweils bis zu 15.000; jede Ecktribüne bis zu 4.000.
• Sitzplätze werden in Stufen teurer, je größer du baust (von 500 € pro Platz bis 2.000 € bei den größten Tribünen), plus eine einmalige Architektengebühr von 50.000 € pro Bauauftrag.
• Du kannst eine Tribüne überdachen, was die Zuschauerzahl erhöht. Ein neues Dach kostet 20 % Aufschlag auf den Baupreis der Tribüne (mindestens 300.000 €).
• Wird eine überdachte Tribüne vergrößert, muss das Dach über die neuen Plätze verlängert werden – das kostet 20 % des Preises der neuen Plätze (mindestens 100.000 €). Du kannst ein bestehendes Dach stattdessen auch abreißen, das ist kostenlos.
• Tribünen können nicht verkleinert werden.
• Der Bau dauert mehrere Spieltage und läuft über Saisongrenzen hinweg weiter.

Zuschauer und Einnahmen:
• Die Zuschauerzahl pro Tribüne hängt von der Stärke beider Teams, deinem Ticketpreis und davon ab, ob die Tribüne ein Dach hat.
• Ticketpreise lassen sich pro Tribüne von 1 bis 100 € festlegen. Rund 15 € ist meist optimal – zu hoch, und die Fans bleiben weg.

Heimvorteil:
• Ein gut gefülltes Stadion erhöht deine Teamstärke um bis zu +10% (mehr Fans, mehr Bonus), während ein Stadion unter 50% Auslastung einen Malus von bis zu −10% bringt.`
    }
  },

  // ─── Tactics ───────────────────────────────────────────────────────────
  {
    key: 'tactics',
    en: {
      title: 'Tactics',
      subtitle: 'Attack mode, play style and pass style',
      text: `Your team has three tactical settings that directly shape the match simulation. You change them on your team page and they apply to your next matches.

Attack mode – controls how often you pass forward:
• Offensive: more forward passes and shots, but more goals conceded too.
• Balanced: an even mix.
• Defensive: cautious build-up, fewer goals at both ends and more draws.

Play style – controls aggression in duels:
• Aggressive: +15% strength in ball contests, but more cards and more fatigue, plus a higher injury risk.
• Normal: the neutral middle ground.
• Friendly: −15% strength in duels, but fewer cards, less fatigue and a lower injury risk.

Pass style – controls pass length:
• Short: only passes to nearby team-mates.
• Mixed: half short, half long.
• Long: mostly long passes to distant players.

There is no single best setting – match your tactics to your squad and your opponent.`
    },
    de: {
      title: 'Taktik',
      subtitle: 'Angriffsmodus, Spielstil und Passstil',
      text: `Dein Team hat drei taktische Einstellungen, die die Spielsimulation direkt beeinflussen. Du änderst sie auf deiner Teamseite, und sie gelten für deine nächsten Spiele.

Angriffsmodus – steuert, wie oft du nach vorne spielst:
• Offensiv: mehr Vorwärtspässe und Schüsse, aber auch mehr Gegentore.
• Balanciert: eine ausgewogene Mischung.
• Defensiv: vorsichtiger Aufbau, weniger Tore auf beiden Seiten und mehr Unentschieden.

Spielstil – steuert die Aggressivität in Zweikämpfen:
• Aggressiv: +15% Stärke in Zweikämpfen, aber mehr Karten und mehr Ermüdung sowie ein höheres Verletzungsrisiko.
• Normal: der neutrale Mittelweg.
• Freundlich: −15% Stärke in Zweikämpfen, aber weniger Karten, weniger Ermüdung und ein geringeres Verletzungsrisiko.

Passstil – steuert die Passlänge:
• Kurz: nur Pässe an nahe Mitspieler.
• Gemischt: halb kurz, halb lang.
• Lang: überwiegend lange Pässe an weit entfernte Spieler.

Es gibt keine generell beste Einstellung – passe deine Taktik an deinen Kader und deinen Gegner an.`
    }
  },

  // ─── Transfers ─────────────────────────────────────────────────────────
  {
    key: 'transfers',
    en: {
      title: 'Transfers',
      subtitle: 'Buy and sell players on the transfer market',
      text: `The transfer market is where you build your squad. You can browse players, list your own for sale, make offers and follow your transfer history.

Buying and selling:
• Filter the market by position, age and level. Each player has a market value as a guide price.
• List a player for sale with your asking price – you cannot list below 75% of the market value.
• Make an offer on another player; the selling club accepts or rejects it. Your offer must also be at least 75% of the market value, and you can make at most 3 offers per player per match day.
• Free agents (players without a club) can be signed for free, but they are weak.

Market value:
• A player's value is based mainly on level and age. Value grows steeply with level (roughly doubling every 10 levels) and drops for players over the age of 22.

Remember your squad must always keep at least 14 players, so you cannot sell below that limit.`
    },
    de: {
      title: 'Transfers',
      subtitle: 'Kaufe und verkaufe Spieler auf dem Transfermarkt',
      text: `Auf dem Transfermarkt baust du deinen Kader auf. Du kannst Spieler durchsuchen, eigene zum Verkauf anbieten, Angebote abgeben und deine Transferhistorie verfolgen.

Kaufen und verkaufen:
• Filtere den Markt nach Position, Alter und Level. Jeder Spieler hat einen Marktwert als Orientierungspreis.
• Biete einen Spieler mit deinem Wunschpreis zum Verkauf an – unter 75% des Marktwerts geht nicht.
• Gib ein Angebot für einen anderen Spieler ab; der verkaufende Verein nimmt es an oder lehnt ab. Auch dein Angebot muss mindestens 75% des Marktwerts betragen, und du kannst pro Spieler und Spieltag höchstens 3 Angebote abgeben.
• Vereinslose Spieler (ohne Verein) kannst du kostenlos verpflichten, sie sind aber schwach.

Marktwert:
• Der Wert eines Spielers richtet sich vor allem nach Level und Alter. Er steigt steil mit dem Level (etwa eine Verdopplung alle 10 Level) und sinkt bei Spielern über 22 Jahren.

Denk daran: Dein Kader muss immer mindestens 14 Spieler haben – darunter kannst du nicht verkaufen.`
    }
  },

  // ─── TV Money ──────────────────────────────────────────────────────────
  {
    key: 'tv-money',
    en: {
      title: 'TV Money',
      subtitle: 'The season-end payout based on your league position',
      text: `At the end of every season each team receives a TV money payout based on where it finished in its league.

How it is calculated:
• Each league level has a base amount. The top division's base is 150,000 € and drops to 75% each level below (112,500 € on level 2, 84,375 € on level 3, and so on).
• Your payout is base × (total teams − rank + 1): the league winner earns base × number of teams, the bottom team earns just the base once.
• So both a strong final position and playing in a higher league increase your TV money.

When it is paid:
• Once per season, after the final match day has been played.
• Until then, the finance page shows an estimated payout based on your current standing, which updates as your position changes through the season.`
    },
    de: {
      title: 'TV-Gelder',
      subtitle: 'Die Auszahlung am Saisonende nach deiner Tabellenposition',
      text: `Am Ende jeder Saison erhält jedes Team eine TV-Geld-Auszahlung, die sich nach seiner Abschlussplatzierung in der Liga richtet.

So wird sie berechnet:
• Jede Liga-Stufe hat einen Basisbetrag. Die höchste Liga hat eine Basis von 150.000 €, jede Stufe darunter erhält 75% davon (112.500 € auf Stufe 2, 84.375 € auf Stufe 3 usw.).
• Deine Auszahlung ist Basis × (Anzahl Teams − Platz + 1): Der Meister erhält Basis × Anzahl Teams, das Tabellenschlusslicht bekommt genau einmal die Basis.
• Sowohl eine gute Abschlussplatzierung als auch eine höhere Liga erhöhen also dein TV-Geld.

Wann es gezahlt wird:
• Einmal pro Saison, nachdem der letzte Spieltag gespielt wurde.
• Bis dahin zeigt die Finanzseite eine geschätzte Auszahlung basierend auf deiner aktuellen Platzierung an, die sich im Saisonverlauf mit deiner Position aktualisiert.`
    }
  },

  // ─── Urgency List ──────────────────────────────────────────────────────
  {
    key: 'urgency-list',
    en: {
      title: 'Urgency List',
      subtitle: 'Your dashboard checklist of things that need attention',
      text: `The urgency list on your dashboard is a checklist of things that need your attention. Each open item links straight to the page where you can fix it, and it disappears once resolved.

Typical items:
• Incomplete lineup – fewer than 11 starters are set.
• Incomplete bench – fewer than 4 substitutes are assigned.
• No captain – your lineup is complete but you have not picked a captain.
• Squad age – your lineup's average age is far from the ideal 27 years (too young or too old).
• Low fitness – one or more of your starters are below 50% fitness.
• Youth player needs attention – a youth player's morale or fitness has dropped below 50%.
• Incoming offers – you have pending transfer offers to review.
• No sponsor – you currently have no active sponsorship deal.
• Forum mentions – someone mentioned you in the forum.

Check the list regularly so you never go into a match day with an empty bench or a tired lineup.`
    },
    de: {
      title: 'Aufgabenliste',
      subtitle: 'Deine Dashboard-Checkliste mit Dingen, die Aufmerksamkeit brauchen',
      text: `Die Aufgabenliste auf deinem Dashboard ist eine Checkliste mit Dingen, die deine Aufmerksamkeit erfordern. Jeder offene Punkt verlinkt direkt auf die Seite, auf der du ihn beheben kannst, und verschwindet, sobald er erledigt ist.

Typische Punkte:
• Unvollständige Aufstellung – weniger als 11 Startspieler sind gesetzt.
• Unvollständige Bank – weniger als 4 Einwechselspieler sind eingeteilt.
• Kein Kapitän – deine Aufstellung ist vollständig, aber du hast keinen Kapitän bestimmt.
• Durchschnittsalter – das Durchschnittsalter deiner Aufstellung ist weit vom idealen Wert von 27 Jahren entfernt (zu jung oder zu alt).
• Niedrige Fitness – einer oder mehrere deiner Startspieler liegen unter 50% Fitness.
• Jugendspieler braucht Aufmerksamkeit – Moral oder Fitness eines Jugendspielers ist unter 50% gefallen.
• Eingehende Angebote – du hast offene Transferangebote zu prüfen.
• Kein Sponsor – du hast aktuell keinen aktiven Sponsorvertrag.
• Forum-Erwähnungen – jemand hat dich im Forum erwähnt.

Sieh dir die Liste regelmäßig an, damit du nie mit leerer Bank oder müder Aufstellung in einen Spieltag gehst.`
    }
  },

  // ─── Youth Players ─────────────────────────────────────────────────────
  {
    key: 'youth-players',
    en: {
      title: 'Youth Players',
      subtitle: 'Develop young talents in your academy',
      text: `Your Youth Academy produces young talents you can develop and later promote to your senior squad.

Youth attributes:
• Level – their current strength (shown as a decimal value).
• Talent – their growth potential. This is hidden, so you have to judge a youngster by how fast they actually improve.
• Morale and fitness – shown as bars; both feed into how much a player gains from training.

Training modes (set per youngster):
• Training: strong level growth, but morale drops a little.
• Friendly match: standard growth and a morale boost, but costs fitness.
• Rest: little growth, but recovers fitness and morale.
• A good rhythm is roughly 2× training, 1× friendly, 1× rest.

Age and promotion:
• Youth players start at age 15. From age 16 you can promote them to your senior squad.
• At 18 you get a warning; if not promoted, they leave at age 19.
• On promotion the level is rounded down to a whole number and the player joins your main squad.

The Youth Academy building (see Buildings) determines how many and how strong the new talents you receive are.`
    },
    de: {
      title: 'Jugendspieler',
      subtitle: 'Entwickle junge Talente in deiner Akademie',
      text: `Deine Jugendakademie bringt junge Talente hervor, die du entwickeln und später in deinen Profikader holen kannst.

Eigenschaften der Jugendspieler:
• Level – die aktuelle Stärke (als Dezimalwert angezeigt).
• Talent – das Entwicklungspotenzial. Es ist verborgen, du musst ein Talent also danach beurteilen, wie schnell es sich tatsächlich verbessert.
• Moral und Fitness – als Balken dargestellt; beide bestimmen mit, wie viel ein Spieler durch Training gewinnt.

Trainingsmodi (je Talent einstellbar):
• Training: starkes Level-Wachstum, aber die Moral sinkt etwas.
• Freundschaftsspiel: normales Wachstum und ein Moral-Schub, kostet aber Fitness.
• Ruhe: kaum Wachstum, regeneriert aber Fitness und Moral.
• Ein guter Rhythmus ist etwa 2× Training, 1× Freundschaftsspiel, 1× Ruhe.

Alter und Beförderung:
• Jugendspieler starten mit 15 Jahren. Ab 16 kannst du sie in deinen Profikader befördern.
• Mit 18 erhältst du eine Warnung; werden sie nicht befördert, verlassen sie den Verein mit 19.
• Bei der Beförderung wird das Level auf eine ganze Zahl abgerundet, und der Spieler wechselt in deinen Hauptkader.

Das Gebäude Jugendakademie (siehe Gebäude) bestimmt, wie viele und wie starke neue Talente du erhältst.`
    }
  }
]
