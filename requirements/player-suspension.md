# Spieler-Sperren (Player Suspension)

## Beschreibung

Spieler koennen durch Gelbe und Rote Karten waehrend eines Spiels gesperrt werden. Gesperrte Spieler verpassen das naechste Spiel und werden automatisch aus der Aufstellung entfernt.

## User Stories

- **US-SUS-01**: Als Spieler sehe ich die Anzahl der Gelben und Roten Karten jedes Spielers in der Spielerliste.
- **US-SUS-02**: Als Spieler sehe ich gesperrte Spieler visuell markiert (Graustufe, reduzierte Deckkraft, Verbots-Icon).
- **US-SUS-03**: Als Spieler kann ich gesperrte Spieler nicht in die Aufstellung setzen.
- **US-SUS-04**: Als Spieler erhalte ich Log-Nachrichten bei Gelben/Roten Karten und Sperren.
- **US-SUS-05**: Als Spieler weiss ich, dass Karten und Sperren nach dem Absitzen automatisch zurueckgesetzt werden.

## Sperr-Regeln

| Ausloeser | Folge |
|---|---|
| 2. Gelbe Karte im selben Spiel | Rote Karte + Platzverweis + Sperre naechstes Spiel |
| 5 Gelbe Karten kumuliert (Saison) | Sperre fuer naechstes Spiel |
| Direkte Rote Karte | Platzverweis + Sperre naechstes Spiel |

## Technische Anforderungen

### Datenbank

- **TA-SUS-01**: Spieler-Tabelle: `yellow_cards` (INT, Standard 0), `red_cards` (INT, Standard 0), `is_suspended` (TINYINT(1), Standard 0).
- **TA-SUS-02**: Im-Spiel-Tracking: `gameDetails.yellowCardsInMatch[playerId]` und `gameDetails.sentOffPlayerIds[]`.

### Karten-Vergabe waehrend Spielen

- **TA-SUS-03**: Kartenwahrscheinlichkeit pro Kampf abhaengig vom Spielstil (Aggressiv: 0,8%, Normal: 0,65%, Freundlich: 0,55%).
- **TA-SUS-04**: Vorsichtsfaktor: Spieler mit 1 Gelber im laufenden Spiel haben nur 17% der normalen Foul-Wahrscheinlichkeit fuer die 2. Gelbe.
- **TA-SUS-05**: 2. Gelbe im selben Spiel = automatische Rote Karte, Spieler wird des Feldes verwiesen.
- **TA-SUS-06**: Direkte Rote Karte: Extrem selten (0,002% Chance bei aggressivem Spielstil).

### Sperr-Mechanik

- **TA-SUS-07**: Gesperrte Spieler werden vor dem Spiel aus der Aufstellung gefiltert: `players.filter(p => !p.is_suspended)`.
- **TA-SUS-08**: Sperren werden am Start des naechsten Spieltags aufgehoben: `UPDATE player SET is_suspended=0, yellow_cards=0, red_cards=0 WHERE is_suspended=1`.
- **TA-SUS-09**: Sperrdauer: Immer genau 1 Spiel.
- **TA-SUS-10**: Saisonwechsel: Alle Karten und Sperren werden zurueckgesetzt.

### Freundschaftsspiele

- **TA-SUS-11**: Gesperrte Spieler werden auch bei Freundschaftsspielen herausgefiltert.
- **TA-SUS-12**: Freundschaftsspiele heben keine Sperren auf und verfolgen keine Karten.

### Frontend-Anzeige

- **TA-SUS-13**: Gelbe Karten: Gelbes Badge mit Anzahl (`card-badge--yellow`).
- **TA-SUS-14**: Rote Karten: Rotes Badge (`card-badge--red`).
- **TA-SUS-15**: Gesperrte Spieler: Verbots-Icon, `table-danger`-Klasse, Graustufe + 50% Deckkraft in der Aufstellung.
- **TA-SUS-16**: Gesperrte Spieler koennen nicht fuer Positionswechsel in der Aufstellung ausgewaehlt werden.

### Log-Nachrichten

- **TA-SUS-17**: `log.playerYellowCard`: "{playerName} hat eine Gelbe Karte erhalten!"
- **TA-SUS-18**: `log.playerRedCard`: "{playerName} hat eine Rote Karte erhalten!"
- **TA-SUS-19**: `log.playerFiveYellows`: "{playerName} hat 5 Gelbe Karten gesammelt!"
- **TA-SUS-20**: `log.playerSuspended`: "{playerName} ist gesperrt und verpasst das naechste Spiel."
- **TA-SUS-21**: Log-Nachrichten werden nur fuer Teams mit menschlichen Spielern generiert (nicht fuer Bots).

### Bot-Verhalten

- **TA-SUS-22**: Bots ueberspringen gesperrte Spieler bei der Aufstellungsoptimierung.
- **TA-SUS-23**: Bots nutzen gesperrte Spieler nur als allerletzte Option (wenn sonst keine Spieler verfuegbar).

### Tests

- Karten-Akkumulation (2 Gelbe = Rot, 5 Gelbe = Sperre)
- Sperr-Aufhebung nach 1 Spiel
- Aufstellungs-Filterung gesperrter Spieler
- Karten-Statistiken pro Spielstil (Bundesliga-Zielwerte)
