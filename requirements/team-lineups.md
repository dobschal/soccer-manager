# Team-Aufstellungen (Lineups)

## Beschreibung

Jedes Team hat eine Formation mit 11 Positionen, die der Spieler mit passenden Spielern besetzen muss. Die Aufstellung beeinflusst direkt die Spielstaerke und das Matchergebnis. Bot-Teams optimieren ihre Aufstellung automatisch.

## User Stories

- **US-LIN-01**: Als Spieler kann ich eine Formation aus 10 verfuegbaren Formationen waehlen.
- **US-LIN-02**: Als Spieler kann ich Spieler auf dem Spielfeld-Diagramm ihren Positionen zuweisen.
- **US-LIN-03**: Als Spieler kann ich Spieler tauschen, indem ich auf eine Position klicke und einen Ersatzspieler auswaehle.
- **US-LIN-04**: Als Spieler kann ich einen Kapitaen aus den aufgestellten Spielern waehlen.
- **US-LIN-05**: Als Spieler sehe ich die Gesamtstaerke meiner Aufstellung als Zahlenwert.
- **US-LIN-06**: Als Spieler sehe ich gesperrte Spieler ausgegraut und kann sie nicht aufstellen.
- **US-LIN-07**: Als Spieler kann ich die Reihenfolge meiner Bankspieler sortieren.
- **US-LIN-08**: Als Spieler kann ich die vier Ersatzbank-Slots besetzen und pro Bankspieler einen Einwechsel-Modus waehlen (siehe [Player Injuries](player-injuries.md)).
- **US-LIN-09**: Als Spieler kann ich mehrere benannte Aufstellungen speichern und ueber ein Auswahlfeld oberhalb des Spielfelds zwischen ihnen wechseln.
- **US-LIN-10**: Als Spieler kann ich ueber "Neue Aufstellung" einen leeren Slot anlegen; ich vergebe dafuer in einem Overlay einen Namen.
- **US-LIN-11**: Als Spieler ist immer genau eine Aufstellung aktiv, und diese wird bei der naechsten Spielberechnung verwendet.
- **US-LIN-12**: Als Spieler kann ich eine nicht mehr benoetigte Aufstellung loeschen, solange mindestens eine uebrig bleibt.
- **US-LIN-14**: Als Spieler kann ich jede Aufstellung ueber ein Stift-Icon neben dem Auswahlfeld umbenennen —
  auch die erste, beim Anlegen des Teams automatisch erzeugte Aufstellung mit ihrem vorgegebenen Namen. Das
  Overlay ist mit dem aktuellen Namen vorbelegt.
- **US-LIN-13**: Als Spieler sehe ich bei einem positionsfremd aufgestellten Spieler unter seinem
  Level, mit wie viel Prozent Abwertung er bewertet wird. Steht er auf seiner Position, wird nichts
  angezeigt.
- **US-LIN-15**: Als Spieler waehle ich im Spielerauswahl-Overlay aus einer horizontal scrollbaren
  Leiste von Spielerkarten — mit derselben Spielerfigur wie auf dem Spielfeld — und stelle den Spieler
  mit einem Klick auf seine Karte auf. Passende Spieler stehen vorne, positionsfremde dahinter, nur
  mit 66% Deckkraft und mit ihrem konkreten Malus.

## Verfuegbare Formationen

Quelle: `getPositionsOfFormation()` in `client/util/formation.js`.

| Formation | Verteidigung | Mittelfeld | Angriff |
|---|---|---|---|
| 352 | 3 (LD, CD, RD) | 5 (LM, DM, DM, RM, OM) | 2 (LA, RA) |
| 343a | 3 (LD, CD, RD) | 4 (LM, DM, RM, OM) | 3 (LA, CA, RA) |
| 343b | 3 (LD, CD, RD) | 4 (LM, CM, CM, RM) | 3 (LA, CA, RA) |
| 451a | 4 (LD, CD, CD, RD) | 5 (LM, DM, CM, RM, OM) | 1 (CA) |
| 451b | 4 (LD, CD, CD, RD) | 5 (LM, DM, DM, RM, OM) | 1 (CA) |
| 442a | 4 (LD, CD, CD, RD) | 4 (LM, DM, RM, OM) | 2 (LA, RA) |
| 442b | 4 (LD, CD, CD, RD) | 4 (LM, CM, CM, RM) | 2 (LA, RA) |
| 433 | 4 (LD, CD, CD, RD) | 3 (LM, CM, RM) | 3 (LA, CA, RA) |
| 541 | 5 (LD, CD, CD, CD, RD) | 4 (LM, CM, CM, RM) | 1 (CA) |
| 532 | 5 (LD, CD, CD, CD, RD) | 3 (LM, CM, RM) | 2 (LA, RA) |

> Hinweis: Die Inline-Kommentare an `Formation` in `client/util/formation.js:40-41` sind
> vertauscht — dort steht `'343a': // 2x CM` und `'343b': // DM, OM`, tatsaechlich ist es
> umgekehrt. Die Tabelle oben gibt die tatsaechlichen Arrays wieder.

## Positionen

| Position | Rolle | Feld-Koordinaten (x, y) |
|---|---|---|
| GK | Torwart | (1, 0) |
| LD | Linker Verteidiger | (0, 1) |
| CD | Zentraler Verteidiger | (1, 1) |
| RD | Rechter Verteidiger | (2, 1) |
| DM | Defensives Mittelfeld | (1, 1.5) |
| LM | Linkes Mittelfeld | (0, 2) |
| CM | Zentrales Mittelfeld | (1, 2) |
| RM | Rechtes Mittelfeld | (2, 2) |
| OM | Offensives Mittelfeld | (1, 2.5) |
| LA | Linker Angreifer | (0, 3) |
| CA | Zentraler Angreifer | (1, 3) |
| RA | Rechter Angreifer | (2, 3) |

## Technische Anforderungen

### Aufstellungs-Logik

- **TA-LIN-01**: Aufstellung wird ueber `player.in_game_position` abgebildet (leerer String = Bank).
- **TA-LIN-02**: Spieler koennen nur auf Positionen gesetzt werden, die ihrer `player.position` entsprechen.
- **TA-LIN-03**: Formationswechsel loescht alle `in_game_position`-Werte.
- **TA-LIN-04**: Kapitaen muss in der Aufstellung stehen; wird er entfernt, wird `captain_id` automatisch geloescht.
- **TA-LIN-05**: Gesperrte Spieler werden automatisch aus der Aufstellung entfernt.

### Bot-Aufstellungsoptimierung

- **TA-LIN-06**: Bots optimieren vor jedem Spiel via `_checkTactic()`.
- **TA-LIN-07**: Priorisierung: Frische > Level (wenn Frische-Differenz > 0.2), sonst Level > Frische.
- **TA-LIN-08**: Gesperrte Spieler nur als allerletzte Option.

### Aufstellungs-Staerke

- **TA-LIN-09**: Staerke = Summe aller `player.level`-Werte der aufgestellten Spieler.
- **TA-LIN-10**: Modifikatoren: Frische-Multiplikator, Starspieler +10%, Motivationsrede +10%, Kapitaens-Bonus, Bot -10%, 50%-Malus fuer positionsfremden Einsatz (nur Startelf, nicht fuer Einwechselspieler) sowie der Heim-Bonus/Malus aus der Stadionauslastung (siehe [Stadium](stadium.md), TA-STD-29 bis TA-STD-32).

### Datenbank

- **TA-LIN-11**: `team.formation` (VARCHAR): Formationscode (z.B. "442a").
- **TA-LIN-12**: `team.captain_id` (BIGINT, nullable): Spieler-ID des Kapitaens.
- **TA-LIN-13**: `player.in_game_position` (VARCHAR, nullable): Aktuelle Position in der Aufstellung.
- **TA-LIN-14**: `player.sort_index` (INT): Bank-Sortierreihenfolge.

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `saveLineup(players, formation)` | Aufstellung und Formation speichern |
| `setCaptain(playerId)` | Kapitaen setzen (oder null zum Loeschen) |
| `saveBenchSortOrder(sortData)` | Bank-Sortierung speichern |
| `getMyTeam` | Team mit allen Spielern und Aufstellung abrufen |

### Frontend

- **TA-LIN-15**: Spielfeld-Diagramm mit CSS Container Queries (Portrait/Landscape).
- **TA-LIN-16**: Spielerkarten zeigen: Position-Badge, Spielerbild, Frische-Badge (farbcodiert), Name, Level-Badge.
- **TA-LIN-17**: Gesperrte Spieler: 50% Deckkraft, Graustufe, Verbots-Icon.
- **TA-LIN-18**: Klick auf eine Position oeffnet das Spielerauswahl-Overlay (`SelectPlayerOverlay`). Es zeigt
  alle einsetzbaren Spieler des Kaders — gesperrte, verletzte und auf Werbereise befindliche bleiben aussen vor —
  plus den Spieler, der aktuell auf dem Slot steht.
- **TA-LIN-36**: Die Auswahl selbst rendert `client/partials/playerPicker.js` (`PlayerPicker`): eine horizontal
  scrollbare Leiste aus Spielerkarten mit derselben Figur wie die Spielfeld-Kacheln (`renderPlayerImage`) sowie
  Positions-, Level- und Frische-Badge. Sortiert wird zuerst nach Passung (`position === slot`), innerhalb beider
  Gruppen nach dem Level, mit dem der Spieler tatsaechlich spielen wuerde (`getPositionLevelFactor`).
  Positionsfremde Karten tragen `is-out-of-position` (66% Deckkraft) und zeigen ihren Malus; die erste von ihnen
  trennt `is-group-start` mit einer breiteren Luecke von den passenden Spielern. Die Karte des aktuellen
  Slot-Inhabers ist `is-current`: info-farben hinterlegt und nie abgedunkelt.
- **TA-LIN-37**: `PLAYER_UPDATED` (Aktionskarte im selben Overlay gespielt) aktualisiert nur die betroffene
  Karte per `innerHTML`, damit Scrollposition und die uebrigen Spielerfiguren erhalten bleiben.
- **TA-LIN-19**: Formations-Dropdown mit 10 Optionen.
- **TA-LIN-20**: Team-Info-Karte: Gesamtgehalt, Durchschnittslevel, Durchschnittsalter, Kaderstaerke, Aufstellungsstaerke.

## Gespeicherte Aufstellungen

- **TA-LIN-26**: Aufstellungen liegen in `team_lineup` (Name, Formation, Passstil, Spielstil, Angriffsmodus,
  `captain_id`, `is_active`) und `team_lineup_player` (`in_game_position`, `bench_position`,
  `bench_substitution_mode` je Spieler). Logik in `server/helper/teamLineupHelper.js`.
- **TA-LIN-27**: Die aktive Aufstellung ist eine **Kopie** des Live-Zustands, nicht dessen Quelle. Spielberechnung,
  Auto-Fill und Bot-Logik lesen weiterhin `team.formation` und `player.in_game_position`.
- **TA-LIN-28**: Write-Through: `syncActiveLineup(teamId)` schreibt den kompletten aktuellen Team-Zustand in die
  aktive Aufstellung. Aufgerufen am Ende von `saveLineup`, `saveBench`, `assignBenchPlayer`, `swapLineupPlayer`,
  `setCaptain`, `updatePassStyle`, `updatePlayStyle`, `updateAttackMode` und `updateBenchSubstitutionMode`.
  Ein voller Snapshot statt Deltas — dadurch kann die gespeicherte Aufstellung nie auseinanderlaufen.
- **TA-LIN-29**: Beim Aktivieren wird zuerst die ausgehende Aufstellung gesichert, dann der Snapshot angewendet.
  Nicht mehr im Kader vorhandene Spieler und Slots, die es in der Formation nicht (mehr) gibt, werden verworfen;
  ein Kapitaen ausserhalb der Startelf wird geloescht.
- **TA-LIN-30**: Eine neue Aufstellung startet mit zufaelliger Formation, ohne aufgestellte Spieler und mit den
  Taktik-Standardwerten (`mixed` / `normal` / `balanced`).
- **TA-LIN-31**: Maximal `MAX_TEAM_LINEUPS` (10) Aufstellungen pro Team, Name maximal 40 Zeichen. Gezaehlt werden
  Unicode-Codepoints (`truncateChars` in `server/lib/util.js`), ein Emoji zaehlt also als **ein** Zeichen und wird
  beim Kuerzen nie in zwei Haelften zerschnitten. Siehe `requirements/user-input.md`.
- **TA-LIN-32**: `ensureActiveLineup` legt fuer Teams ohne Aufstellung lazily eine aus dem aktuellen Zustand an —
  relevant fuer Teams, die nach der Seeding-Migration entstanden sind oder von einem Bot uebernommen wurden.
- **TA-LIN-33**: API: `getMyLineups`, `createMyLineup(name)`, `activateMyLineup(id)`, `renameMyLineup(id, name)`,
  `deleteMyLineup(id)`.
- **TA-LIN-34**: Umbenennen und Anlegen teilen sich in `aTeam.js` dasselbe Namens-Overlay
  (`_showLineupNameOverlay`). Der Wert wird per JS in das Input gesetzt, nicht ins `value`-Attribut gerendert,
  damit Anfuehrungszeichen im Namen das Markup nicht aufbrechen. Umbenennen aendert nur den Namen und loest
  daher **kein** Neuladen des Teams aus — es wird nur die Seite neu gerendert.

## Positionsfremder Einsatz

- **TA-LIN-34**: Die Spielfeld-Kachel zeigt neben dem roten Rahmen um die Positions-Plakette den
  konkreten Malus (z.B. `-10%`) unter dem Level-Badge. Werte und Formel stehen in
  [Game Calculation](game-calculation.md) (TA-GC-30 ff., #540).
- **TA-LIN-35**: `getPositionPenalty` in `client/util/player.js` ist die einzige Quelle — Client-Anzeige
  und Server-Berechnung nutzen dieselbe Funktion, damit angezeigter und tatsaechlicher Malus nie
  auseinanderlaufen.

## Mindestteamgroesse

- **TA-LIN-21**: Ein Team muss zu jeder Zeit mindestens 14 Spieler haben (`MIN_TEAM_SIZE` in `server/helper/playerHelper.js`).
- **TA-LIN-22**: Wird beim Entlassen eines Spielers (`server/routes/players.js:firePlayer`) und beim Annehmen eines Handelsangebots (`server/helper/tradeHelper.js:acceptOffer`) geprueft.
- **TA-LIN-23**: Bot-Teams sind von dieser Einschraenkung ausgenommen.

## Maximale Teamgroesse

- **TA-LIN-24**: Ein Team darf maximal 42 Spieler haben (`MAX_TEAM_SIZE` in `server/helper/playerHelper.js`).
- **TA-LIN-25**: Geprueft an vier Stellen, jeweils mit `error.teamTooLarge`:
  - `server/routes/players.js` — Verpflichtung eines freien Spielers
  - `server/routes/trade.js` — Erstellen eines Kaufangebots und direkter Kauf
  - `server/helper/tradeHelper.js:acceptOffer` — Kaeuferseite beim Annehmen
  - `server/routes/youth.js:promoteYouthPlayer` — Befoerderung eines Jugendspielers

### Tests

- Aufstellung speichern und Spieler-Positionen aktualisieren
- Positions-Malus: alle Reihen-Kombinationen, Torwart-Sonderfall, Anzeige auf der Kachel
- Kapitaen-Logik (Setzen, Loeschen bei Entfernung aus Aufstellung)
- Formationswechsel loescht Positionen
- Taktik-Einstellungen validieren
- Mindestteamgroesse beim Entlassen und bei Transfers
- Gespeicherte Aufstellungen: Snapshot/Restore, verkaufte Spieler und unbekannte Slots werden verworfen,
  Kapitaen wird bei Bedarf geloescht, Lineup-Obergrenze, letzte Aufstellung kann nicht geloescht werden,
  Write-Through aus allen mutierenden Endpunkten
- Umbenennen: Stift-Icon auch bei nur einer Aufstellung, Vorbelegung mit dem aktuellen Namen, unveraenderter
  Name loest keinen Request aus, Fallback auf die aktive Aufstellung ohne Auswahlfeld im DOM
- Emojis im Aufstellungsnamen: 40 Emojis passen in das 40-Zeichen-Limit, laengere Namen werden gekuerzt,
  ohne ein Surrogate-Paar zu zerschneiden
