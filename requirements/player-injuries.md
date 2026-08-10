# Spieler-Verletzungen (Player Injuries)

## Beschreibung

Spieler koennen sich waehrend eines Spiels verletzen. Die Verletzungswahrscheinlichkeit steigt bei niedriger Fitness. Verletzte Spieler fallen fuer eine bestimmte Anzahl an Spieltagen aus und werden automatisch aus der Aufstellung entfernt. Waehrend des Spiels werden verletzte Spieler durch Bankspieler ersetzt. Zusaetzlich kann der Nutzer pro Bankspieler festlegen, unter welcher Bedingung dieser eingewechselt werden soll (Einwechsel-Modus).

## User Stories

- **US-INJ-01**: Als Spieler koennen sich meine Spieler waehrend eines Spiels verletzen, wobei die Wahrscheinlichkeit bei niedriger Fitness hoeher ist.
- **US-INJ-02**: Als Spieler sehe ich, welche Spieler verletzt sind und wie viele Spieltage sie noch ausfallen.
- **US-INJ-03**: Als Spieler werden verletzte Spieler automatisch aus der Aufstellung entfernt und koennen nicht aufgestellt werden.
- **US-INJ-04**: Als Spieler erhalte ich Log-Nachrichten bei Verletzungen und Einwechselungen.
- **US-INJ-05**: Als Spieler muss ich eine Ersatzbank mit mindestens je einem Torwart, Verteidiger, Mittelfeldspieler und Angreifer besetzen.
- **US-INJ-09**: Als Spieler kann ich pro Bankspieler einen Einwechsel-Modus waehlen (nur bei Verletzung, immer, bei Fuehrung, bei Rueckstand), damit Auswechselungen zu meiner Taktik passen.
- **US-INJ-06**: Als Spieler sehe ich verletzte Spieler in der Spielerliste visuell markiert (aehnlich wie gesperrte Spieler).
- **US-INJ-07**: Als Spieler sehe ich Verletzungen und Einwechselungen in den Spieldetails.
- **US-INJ-08**: Als Spieler sehe ich auf der Liga- und Pokal-Ergebnisseite eine Liste der verletzten Spieler (analog zu gesperrten Spielern).
- **US-INJ-10**: Als Spieler kann ich mit einer Arztpraxis den Ausfall eines verletzten Spielers um einen Spieltag verkuerzen (Aktionskarte "Medizinische Behandlung", siehe [Buildings](buildings.md)).

## Ersatzbank (Bench)

### Pflichtbesetzung

Der Nutzer muss auf der Ersatzbank mindestens folgende Positionen besetzen:

| Position | Anzahl |
|---|---|
| Torwart (GK) | 1 |
| Verteidiger (LD, CD, RD) | 1 |
| Mittelfeldspieler (DM, LM, CM, RM, OM) | 1 |
| Angreifer (LA, CA, RA) | 1 |

- **TA-BEN-01**: Die Ersatzbank wird ueber neue Felder in der `player`-Tabelle abgebildet: `bench_position` (VARCHAR, nullable). Moegliche Werte: `BENCH_GK`, `BENCH_DEF`, `BENCH_MID`, `BENCH_ATT`.
- **TA-BEN-07**: Zusaetzlich haelt jeder Spieler einen `bench_substitution_mode` (VARCHAR(20), NOT NULL, Standard `'injury_only'`) mit den erlaubten Werten `always`, `injury_only`, `leading`, `trailing`.
- **TA-BEN-02**: Pro Team kann maximal ein Spieler je `bench_position` zugewiesen werden.
- **TA-BEN-03**: Die Ersatzbank wird auf der Aufstellungsseite (My Team) unterhalb des Spielfelds angezeigt, mit vier Slots fuer die vier Positionen.
- **TA-BEN-04**: Nur Spieler mit passender `position` koennen auf den jeweiligen Bank-Slot gesetzt werden (z.B. nur Torwaerte auf `BENCH_GK`).
- **TA-BEN-05**: Gesperrte und verletzte Spieler koennen nicht auf die Ersatzbank gesetzt werden.
- **TA-BEN-06**: Es wird eine Warnung auf dem Dashboard angezeigt, wenn die Ersatzbank nicht vollstaendig besetzt ist.

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `saveBench(benchData)` | Ersatzbank speichern (`[{playerId, benchPosition, substitutionMode?}]`); `substitutionMode` faellt auf `injury_only` zurueck |
| `updateBenchSubstitutionMode(playerId, substitutionMode)` | Nur den Einwechsel-Modus eines Bankspielers aendern |
| `getBench()` | Aktuelle Ersatzbank-Besetzung abrufen |

## Verletzungsliste

| Verletzung | Dauer (Spieltage) |
|---|---|
| Prellung (Bruise) | 1 |
| Muskelzerrung (Muscle Strain) | 2 |
| Baenderdehnung (Ligament Sprain) | 3 |
| Muskelfaserriss (Muscle Tear) | 4 |
| Knochenbruch (Fracture) | 6 |
| Meniskusriss (Meniscus Tear) | 8 |
| Kreuzbandriss (ACL Tear) | 14 |
| Achillessehnenriss (Achilles Tendon Rupture) | 18 |

## Verletzungsmechanik

### Verletzungswahrscheinlichkeit

- **TA-INJ-01**: Verletzungen werden waehrend der Spielsimulation in `playGameStep()` geprueft, bei jedem Kampf um den Ball.
- **TA-INJ-02**: Basiswahrscheinlichkeit pro Kampf: 0,0375% (0,000375). Der Wert wurde mit der Einfuehrung der Arztpraxis um ein Viertel angehoben (vorher 0,0003): deren Karte "Medizinische Behandlung" verkuerzt Ausfaelle, also duerfen etwas mehr Verletzungen passieren. Fuer ein Team **ohne** Praxis heisst das schlicht: ein bisschen mehr Ausfall.
- **TA-INJ-03**: Fitness-Multiplikator: `1 + (1 - freshness) * 4`. Bei voller Fitness (1.0) ist der Multiplikator 1x, bei 50% Fitness 3x, bei 20% Fitness 4,2x.
- **TA-INJ-04**: Spielstil-Multiplikator: Aggressiv 1,5x, Normal 1,0x, Freundlich 0,7x.
- **TA-INJ-05**: Effektive Wahrscheinlichkeit: `basisWahrscheinlichkeit * fitnessMultiplikator * spielstilMultiplikator`.
- **TA-INJ-06**: Pro Spiel und Team kann sich maximal ein Spieler verletzen.
- **TA-INJ-07**: Bereits verletzte oder ausgewechselte Spieler koennen sich nicht erneut verletzen.

### Verletzungstyp-Auswahl

- **TA-INJ-08**: Bei einer Verletzung wird der Typ gewichtet zufaellig ausgewaehlt. Leichtere Verletzungen sind wahrscheinlicher.

| Verletzung | Gewicht |
|---|---|
| Prellung | 30 |
| Muskelzerrung | 25 |
| Baenderdehnung | 18 |
| Muskelfaserriss | 12 |
| Knochenbruch | 7 |
| Meniskusriss | 5 |
| Kreuzbandriss | 2 |
| Achillessehnenriss | 1 |

### Einwechselung bei Verletzung

- **TA-INJ-09**: Wird ein Spieler verletzt, wird automatisch ein passender Bankspieler eingewechselt.
- **TA-INJ-10**: Zuordnung nach Positionsgruppe, nicht nach exakter Position. Ein Bankspieler ersetzt jeden Spieler derselben Gruppe:
  - `BENCH_GK` ersetzt GK
  - `BENCH_DEF` ersetzt LD, CD, RD (z.B. ein LD kann einen RD ersetzen)
  - `BENCH_MID` ersetzt DM, LM, CM, RM, OM (z.B. ein RM kann einen LM ersetzen)
  - `BENCH_ATT` ersetzt LA, CA, RA (z.B. ein LA kann einen CA ersetzen)
- **TA-INJ-11**: Wurde der passende Bankspieler bereits eingewechselt, wird kein Ersatz gestellt (wie bei Platzverweis - numerische Unterzahl).
- **TA-INJ-12**: Der eingewechselte Spieler uebernimmt die exakte Position (`in_game_position`) des verletzten/ausgewechselten Spielers fuer die restliche Spielberechnung, unabhaengig von seiner eigentlichen Position.
- **TA-INJ-46**: Eingewechselte Spieler werden **nie** vom 50%-Malus fuer positionsfremden Einsatz getroffen — der gilt nur fuer Startelf-Spieler. Eine Notloesung von der Bank soll nicht zusaetzlich bestraft werden.
- **TA-INJ-47**: Bei jeder Auswechselung werden `enterMinute` (Einwechselnder) und `exitMinute` (Ausgewechselter) gesetzt. Daraus ergibt sich der Frische-Verlust-Anteil (siehe [Player Fitness](player-fitness.md)).

### Geplante Auswechselung (Einwechsel-Modus)

Statt einer automatischen Frische-Regel entscheidet der Nutzer pro Bankspieler, wann dieser
eingewechselt wird. Umgesetzt in `checkScheduledSubstitutions()` (`server/play-game.js`).

| Modus | Bedeutung |
|---|---|
| `injury_only` (Standard) | Kommt nur bei einer Verletzung — wird von `checkScheduledSubstitutions` uebersprungen |
| `always` | Wird eingewechselt, sobald moeglich |
| `leading` | Wird nur eingewechselt, wenn das eigene Team in Fuehrung liegt |
| `trailing` | Wird nur eingewechselt, wenn das eigene Team zurueckliegt |

- **TA-INJ-13**: Der Einwechsel-Modus liegt pro Spieler in `player.bench_substitution_mode`; fehlt der Wert, gilt `injury_only`.
- **TA-INJ-14**: Geplante Auswechselungen greifen erst **ab Minute 45**. Verletzungsbedingte Einwechselungen sind davon unabhaengig und koennen jederzeit passieren.
- **TA-INJ-15**: Jeder Bank-Slot kann nur einmal pro Spiel genutzt werden (eingewechselter Spieler steht nicht erneut zur Verfuegung).
- **TA-INJ-16**: Auswahl des ausgewechselten Spielers (`_findSubstitutionTarget`): Kandidaten sind alle Feldspieler, deren `in_game_position` derselben Positionsgruppe wie der Bank-Slot angehoert; davon wird der mit der **niedrigsten Frische** gezogen.
- **TA-INJ-17**: Pro Spiel und Team sind maximal 3 geplante Auswechselungen moeglich (`substitutionCountA` / `substitutionCountB`). Verletzungs-Einwechselungen zaehlen nicht dazu.
- **TA-INJ-44**: Die Slots werden in fester Reihenfolge geprueft: `BENCH_GK`, `BENCH_DEF`, `BENCH_MID`, `BENCH_ATT`.
- **TA-INJ-45**: `reason` in `gameDetails.substitutions` ist bei geplanten Auswechselungen der verwendete Modus (`always` / `leading` / `trailing`), bei Verletzungen `"injury"`.

## Datenbank

- **TA-INJ-18**: Neue Spalten in `player`-Tabelle:
  - `is_injured` (TINYINT(1), Standard 0)
  - `injury_type` (VARCHAR(50), nullable)
  - `injury_days_left` (INT, Standard 0) - Verbleibende Spieltage bis zur Genesung
  - `bench_position` (VARCHAR(20), nullable) - Ersatzbank-Position
  - `bench_substitution_mode` (VARCHAR(20), NOT NULL, Standard `'injury_only'`) - Einwechsel-Modus
- **TA-INJ-19**: Verletzungserholung: Am Anfang jedes Spieltags wird `injury_days_left` um 1 reduziert. Bei 0 wird `is_injured = 0`, `injury_type = NULL` gesetzt.
- **TA-INJ-20**: Saisonwechsel: Verletzungen werden NICHT zurueckgesetzt (laufen ueber Saisonende hinaus weiter).
- **TA-INJ-48**: Verletzte Spieler regenerieren **nicht**, sondern verlieren pro Spieltag 5% Frische (`_giveAllPlayersFreshness` in `server/play-game-day.js`, untere Grenze 0).

## Spieldetails (gameDetails)

- **TA-INJ-21**: Neues Feld `gameDetails.injuries`: Array von `{ playerId, playerName, teamIndex, injuryType, minute }`.
- **TA-INJ-22**: Neues Feld `gameDetails.substitutions`: Array von `{ playerInId, playerInName, playerOutId, playerOutName, teamIndex, reason, minute }`. `reason` ist `"injury"` oder der ausloesende Einwechsel-Modus (`"always"` / `"leading"` / `"trailing"`).
- **TA-INJ-23**: Verletzungen und Auswechselungen werden im Spiel-Log als Events gespeichert (analog zu Karten-Events).

## Frontend-Anzeige

### Spielerliste

- **TA-INJ-24**: Verletzte Spieler werden visuell markiert: Verletzungs-Icon (z.B. Kreuz/Pflaster), `table-danger`-Klasse, Graustufe + 50% Deckkraft in der Aufstellung.
- **TA-INJ-25**: Tooltip oder Badge zeigt Verletzungstyp und verbleibende Spieltage an.
- **TA-INJ-26**: Verletzte Spieler koennen nicht in die Aufstellung oder auf die Ersatzbank gesetzt werden.

### Aufstellungsseite

- **TA-INJ-27**: Verletzte Spieler erscheinen nicht in der Spielerauswahl fuer Positionen und Ersatzbank.
- **TA-INJ-28**: Ersatzbank wird als vier Slots unterhalb des Spielfelds angezeigt (GK, DEF, MID, ATT).

### Spieldetails-Seite

- **TA-INJ-29**: Verletzungen werden im Spielverlauf mit Verletzungs-Icon und Spielminute angezeigt.
- **TA-INJ-30**: Auswechselungen werden mit Ein-/Auswechsel-Icon, Spielernamen und Minute angezeigt.
- **TA-INJ-31**: Separate Zusammenfassung der Verletzungen und Auswechselungen neben den Karten-Statistiken.

### Liga- und Pokal-Ergebnisseite

- **TA-INJ-32**: Neue Sektion "Verletzte Spieler" unterhalb der gesperrten Spieler, mit Tabelle: Spielerbild, Spielername, Teamname, Verletzungstyp, verbleibende Spieltage.
- **TA-INJ-33**: Nur fuer den naechsten anstehenden Spieltag angezeigt (analog zu gesperrten Spielern).
- **TA-INJ-34**: Hervorhebung eigener Spieler mit `table-info`-Klasse.

### API-Endpunkt

- **TA-INJ-35**: Neuer Endpunkt `getInjuredPlayers(level, league)`: Gibt alle verletzten Spieler der Liga zurueck mit Verletzungstyp und verbleibenden Spieltagen.

## Log-Nachrichten

- **TA-INJ-36**: `log.playerInjured`: "{playerName} hat sich verletzt: {injuryType}! Ausfall fuer {days} Spieltag(e)."
- **TA-INJ-37**: `log.playerSubstitutedInjury`: "{playerOutName} wird verletzungsbedingt durch {playerInName} ersetzt."
- **TA-INJ-38**: `log.playerSubstitutedFreshness`: "{playerOutName} wird wegen niedriger Fitness durch {playerInName} ersetzt." — wird fuer geplante Auswechselungen verwendet, da dabei stets der Spieler mit der niedrigsten Frische weicht.
- **TA-INJ-39**: `log.playerRecovered`: "{playerName} ist wieder fit und steht zur Verfuegung."
- **TA-INJ-40**: Log-Nachrichten werden nur fuer Teams mit menschlichen Spielern generiert (nicht fuer Bots).

## Bot-Verhalten

- **TA-INJ-41**: Bots besetzen die Ersatzbank automatisch bei der Aufstellungsoptimierung (`_checkTactic()`).
- **TA-INJ-42**: Bots waehlen den besten verfuegbaren Spieler je Positionsgruppe fuer die Bank.
- **TA-INJ-43**: Bots ueberspringen verletzte Spieler bei der Aufstellungsoptimierung (analog zu gesperrten Spielern).

## Ziel-Statistiken

| Metrik | Zielwert |
|---|---|
| Verletzungen pro Spiel (beide Teams) | 0,19 - 0,31 |
| Durchschnittliche Ausfalldauer | 3 - 4 Spieltage |

Fuer geplante Auswechselungen gibt es keinen statistischen Zielwert: die Anzahl haengt
ausschliesslich davon ab, welche Modi der Nutzer setzt. Mit dem Standard `injury_only`
finden ueberhaupt keine geplanten Auswechselungen statt.

## Tests

- Verletzungswahrscheinlichkeit bei verschiedenen Fitness-Werten
- Verkuerzung eines Ausfalls per Aktionskarte "Medizinische Behandlung" (siehe [Action Cards](action-cards.md), TA-AC-29)
- Verletzungswahrscheinlichkeit bei verschiedenen Spielstilen
- Maximal eine Verletzung pro Team pro Spiel
- Einwechselung bei Verletzung mit korrektem Positionsmatching
- Einwechsel-Modi: `injury_only` wechselt nie geplant ein, `always` sobald moeglich, `leading` / `trailing` nur beim passenden Spielstand
- Geplante Auswechselungen erst ab Minute 45
- Maximum 3 geplante Auswechselungen pro Spiel; Verletzungs-Einwechselungen zaehlen nicht mit
- `_findSubstitutionTarget` waehlt den Feldspieler mit der niedrigsten Frische aus der passenden Positionsgruppe
- Validierung von `substitutionMode` in `saveBench` und `updateBenchSubstitutionMode`
- Ersatzbank-Besetzung und -Validierung
- Verletzungserholung ueber Spieltage
- Verletzte Spieler werden aus Aufstellung gefiltert
- Statistische Validierung der Verletzungshaeufigkeit ueber 500+ Spiele
- Bot-Ersatzbank-Optimierung
