# Spielberechnung (Game Calculation)

## Beschreibung

Die Spielberechnung simuliert ein Fussballspiel Schritt fuer Schritt. Jedes Spiel besteht aus ca. 900 Schritten (90 Spielminuten, 10 Schritte pro Minute), in denen Passen, Kaempfe um den Ball, Schuesse und Tore simuliert werden.

## User Stories

- **US-GC-01**: Als Spieler erwarte ich realistische Spielergebnisse, die den Statistiken der Bundesliga aehneln.
- **US-GC-02**: Als Spieler kann ich die Spieldetails einsehen (Tore, Schuesse, Ballbesitz, Karten, Aufstellungen).
- **US-GC-03**: Als Spieler sehe ich, dass meine taktischen Entscheidungen (Angriffsmodus, Spielstil) die Ergebnisse beeinflussen.
- **US-GC-04**: Als Spieler erwarte ich, dass staerkere Teams haeufiger gewinnen, aber Ueberraschungen moeglich sind.
- **US-GC-05**: Als Spieler sehe ich im Spielticker den Spielverlauf mit Halbzeit, und bei Pokalspielen
  auch Verlaengerung und Elfmeterschiessen.
- **US-GC-06**: Als Spieler sehe ich im Spielticker Balleroberungen, gewonnene Zweikaempfe,
  Einwechslungen, Verletzungen und den Grund fuer jede Gelbe und Rote Karte.
- **US-GC-07**: Als Spieler sehe ich zu jedem Ereignis im Spielticker ein kleines Bild des beteiligten
  Spielers.
- **US-GC-09**: Als Spieler startet der Spielticker mit einer kurzen Anpfiff-Sequenz, bevor das erste
  Ereignis erscheint.
- **US-GC-10**: Als Spieler sehe ich bei einer Verletzung, welche Verletzung der Spieler erlitten hat
  (z. B. "Muskelzerrung"), nicht nur die Ausfalldauer.
- **US-GC-11**: Als Spieler kann ich den Spielticker waehrend des Ablaufs per Knopfdruck auf doppelte
  Geschwindigkeit umschalten und wieder zurueck.
- **US-GC-08**: Als Spieler wird ein positionsfremd aufgestellter Spieler nicht mehr pauschal halbiert,
  sondern je nach Entfernung zu seiner Position abgestuft bewertet.

## Ziel-Statistiken (Bundesliga-Referenz)

### Tore

| Metrik | Zielwert |
|---|---|
| Durchschnittliche Tore pro Spiel | 3,16 |
| Unentschieden | 24% |
| 1 Tor Differenz | 32% |
| 2 Tore Differenz | 22% |
| 3 Tore Differenz | 11% |
| 4 Tore Differenz | 6% |
| 5+ Tore Differenz | 4% |

### Schuesse

| Metrik | Zielwert |
|---|---|
| Durchschnitt pro Team pro Spiel | 13 |
| Maximum pro Team pro Spiel | 30 |
| Minimum pro Team pro Spiel | 0 |

### Karten

| Spielstil | Gelbe Karten/Spiel | Rote Karten/Spiel |
|---|---|---|
| Aggressiv | 4,0 | 0,13 |
| Normal | 3,5 | 0,10 |
| Freundlich | 3,0 | 0,07 |

## Technische Anforderungen

### Spielsimulation

- **TA-GC-01**: Spielablauf in `playGameStep()` mit 900 Schritten + 0-49 Nachspielzeit-Schritte.
- **TA-GC-02**: Jeder Schritt prueft: Numerische Unterzahl -> Kampf um Ball -> Schuss -> Pass.

### Kampf um den Ball

- **TA-GC-03**: Kampfwahrscheinlichkeit: 75% fuer Angreifer, 50% fuer Mittelfeldspieler, 10% fuer Verteidiger, 1% fuer Torwart.
- **TA-GC-04**: Gewinnwahrscheinlichkeit: `spielerLevel / (spielerLevel + gegnerLevel)`.
- **TA-GC-05**: Spielstil-Bonus: Aggressiv +15%, Normal 0%, Freundlich -15% auf effektives Level.
- **TA-GC-06**: Streak-Mechanik: Aufeinanderfolgende gewonnene Kaempfe erhoehen die Torschuss-Wahrscheinlichkeit.

### Schuesse

- **TA-GC-07**: Schusswahrscheinlichkeit: 8,5% Angreifer, 3,7% Mittelfeld, 0,4% Verteidiger, 0,005% Torwart.
- **TA-GC-08**: Streak-Bonus: `Schusswahrscheinlichkeit * (1 + min(streak, 6) * 0.15)`, max. 95%. Streak-Cap bei 6.
- **TA-GC-09**: Schuss-Genauigkeit: `0.25 + spielerLevel / 400`.
- **TA-GC-10**: Torwart-Parade: `torwartLevel * 2.0 / (torwartLevel * 2.0 + schuetzeLevel)`.

### Passen

- **TA-GC-11**: Pass-Richtung basierend auf Angriffsmodus: Offensiv 85% vorwaerts, Balanciert 50%, Defensiv 20%.
- **TA-GC-12**: Abfangwahrscheinlichkeit bei Vorwaertspaessen: `basisWahrscheinlichkeit * (1 - spielerLevel / 150)`.
- **TA-GC-13**: Pass-Distanz berechnet aus Position-Koordinaten (x, y).

### Karten

- **TA-GC-14**: Kartenwahrscheinlichkeit pro Kampf: Aggressiv 0,8%, Normal 0,65%, Freundlich 0,55%.
- **TA-GC-15**: Vorsichtsfaktor: Spieler mit 1 Gelber Karte im Spiel haben nur 17% der normalen Foul-Wahrscheinlichkeit.
- **TA-GC-16**: 2. Gelbe im selben Spiel = Automatische Rote Karte und Platzverweis.
- **TA-GC-17**: Direkte Rote: Extrem selten (0,002% bei aggressivem Spielstil).

### Level-Modifikatoren

- **TA-GC-18**: Frische-Multiplikator: `angepasstesLevel = frische * basisLevel`.
- **TA-GC-19**: Starspieler-Bonus: +10%.
- **TA-GC-20**: Motivationsrede: +10% teamweit.
- **TA-GC-21**: Kapitaens-Staerke-Multiplikator basierend auf Kapitaens-Level.
- **TA-GC-22**: Bot-Team-Nachteil: -10%.
- **TA-GC-29**: Positionsfremder Einsatz: -10% bis -50% je nach Entfernung zur natuerlichen Reihe (siehe unten, #540).

### Positionsfremder Einsatz (#540)

- **TA-GC-30**: Ein Startspieler abseits seiner natuerlichen Position verliert einen Teil seines
  In-Game-Levels. Die Hoehe haengt davon ab, wie weit der Slot von seiner Reihe entfernt liegt
  (`getPositionPenalty` in `client/util/player.js`):

  | Natuerliche Reihe | gleiche Reihe | Mittelfeld | Abwehr | Sturm | Tor |
  |---|---|---|---|---|---|
  | Sturm (LA/CA/RA) | -10% | -20% | -30% | – | -50% |
  | Mittelfeld (DM/LM/CM/RM/OM) | -10% | – | -20% | -20% | -50% |
  | Abwehr (LD/CD/RD) | -10% | -20% | – | -30% | -50% |
  | Tor (GK) | – | -50% | -50% | -50% | – |

- **TA-GC-31**: Der Torwart ist bewusst absolut: jeder Feldspieler im Tor **und** jeder Torwart auf
  dem Feld verliert 50%. Die Rolle hat mit dem Rest des Feldes nichts gemeinsam.
- **TA-GC-32**: Vorher galt pauschal -50% fuer jeden positionsfremden Einsatz. Der abgestufte Malus
  ist damit fuer alle Feldspieler-Kombinationen milder.
- **TA-GC-33**: Einwechselspieler bleiben ausgenommen (siehe `_substitutePlayer`) — ein Not-Wechsel
  wird nie bestraft.
- **TA-GC-34**: Die Aufstellung zeigt den Malus als Prozentwert unter dem Level des Spielers an,
  zusaetzlich zum roten Rahmen um die Positions-Plakette. Bei positionstreuer Besetzung wird
  nichts angezeigt.

### Numerische Unterzahl

- **TA-GC-23**: Pro fehlendem Spieler (Platzverweis) 2% Ballverlust-Wahrscheinlichkeit pro Schritt.

### Pokal-Spiele

- **TA-GC-24**: Kein Unentschieden erlaubt - Verlaengerung bis ein Tor faellt.

### Datenspeicherung

- **TA-GC-25**: Komplettes `gameDetails`-Objekt als JSON in `game.details` gespeichert.
- **TA-GC-26**: Enthaelt: Log-Events, Tore, Staerke, Schuesse, Stadion-Details, Aufstellungen, Karten.
- **TA-GC-27**: Jeder Zweikampf-Eintrag traegt `minute` und `streak` (Laenge der Passfolge, die er
  beendet hat). Beides existiert nur fuer den Spielticker (#539) — er waehlt daraus die wenigen
  Balleroberungen aus, die einen echten Angriff gestoppt haben.
- **TA-GC-28**: Karten-Eintraege tragen `foulOn` (die ID des Gegenspielers aus dem Zweikampf) und bei
  Gelb-Rot zusaetzlich `secondYellow`. Mehr Kartengruende gibt es nicht — die Engine modelliert keine
  Foularten, und der Ticker erfindet auch keine.

### Tests

- Statistische Validierung ueber 500+ Spiele gegen Bundesliga-Zielwerte
- Spielstil-Auswirkungen (Aggressiv vs. Normal vs. Freundlich)
- Angriffsmodus-Auswirkungen (Offensiv vs. Balanciert vs. Defensiv)
- Zufalls-Kontrolle (zwei identische Spiele sollen unterschiedliche, aber aehnliche Ergebnisse liefern)
- Staerke-Ungleichgewicht (staerkeres Team gewinnt haeufiger)
- Positions-Malus: jede Reihen-Kombination, Torwart-Sonderfall, Obergrenze 50%, Einwechselspieler ausgenommen
- Spielticker: Auswahl der Balleroberungen und gewonnenen Zweikaempfe (Streak-Schwelle,
  Mindestabstand, fehlende Minute, keine Doppelklassifizierung), Anpfiff-Sequenz und ihre Position,
  Halbzeit-Einschub und Reihenfolge, Verlaengerung/Elfmeterschiessen, Einwechslungen, Verletzungen
  inkl. Verletzungsart, Kartengruende
- Spiel-Log: Minute und Streak an jedem Zweikampf, `foulOn` an jeder Karte

## Spielticker (#539)

Der Spielticker (`client/partials/spielTickerOverlay.js`) spielt ein fertig berechnetes Spiel
animiert nach. Er zeigt ausschliesslich, was im Spiel-Log tatsaechlich steht.

- **TA-GC-35**: Ereignisse im Ticker: Anpfiff, Tore, Torchancen/Paraden, Karten, Verletzungen,
  Einwechslungen, ausgewaehlte Balleroberungen und gewonnene Zweikaempfe, Halbzeit, Verlaengerung und
  Elfmeterschiessen.
- **TA-GC-36**: Balleroberungen: Ein Spiel protokolliert rund 230 Zweikaempfe. Angezeigt werden nur
  die, bei denen die verteidigende Seite den Ball nach mindestens `RECOVERY_MIN_STREAK` (3) Paessen
  erobert hat, ausgeduennt auf hoechstens eine pro `RECOVERY_MIN_GAP_MINUTES` (5) Minuten — etwa
  10-15 pro Spiel.
- **TA-GC-42**: Gewonnene Zweikaempfe (die angreifende Seite behaelt den Ball) brauchen eine hoehere
  Huerde, weil sie den Grossteil der Zweikaempfe ausmachen: `DUEL_MIN_STREAK` (6) Paesse und
  hoechstens einer pro `DUEL_MIN_GAP_MINUTES` (12) Minuten. Beide Zweikampf-Sorten teilen denselben
  Sampler; ein Eintrag kann nie gleichzeitig Balleroberung und gewonnener Zweikampf sein.
- **TA-GC-46**: Jede Ereignisart hat ihr eigenes Icon (`EVENT_ICONS`). Zweikampf und Balleroberung sind
  bewusst unterscheidbar: der Zweikampf zeigt zwei Figuren (`fa-users`), die Balleroberung den
  Besitzwechsel (`fa-exchange`). Vorher trugen beide ein Icon, das ihre Bedeutung nicht traf (#539).
- **TA-GC-43**: Einwechslungen kommen aus `details.substitutions` (Ein-/Auswechselspieler, Grund,
  Minute); Eintraege ohne Minute werden uebersprungen.
- **TA-GC-37**: Die Halbzeit wird zwischen der 45. und 46. Minute eingeschoben und haelt
  `BREAK_PAUSE_MS` (2000 ms), bevor es weitergeht. Der Anpfiff liegt mit `order: -1` in Minute 0 und
  damit vor allem, was in Minute 0 protokolliert wurde; er haelt genauso lang.
- **TA-GC-38**: Bei Pokalspielen wird zusaetzlich der Beginn der Verlaengerung angezeigt und, falls
  vorhanden, das Elfmeterschiessen als Abschluss mit jedem einzelnen Schuetzen.
- **TA-GC-39**: Kartengruende kommen aus `foulOn` / `secondYellow` (siehe TA-GC-28): "Foul an X",
  "Gelb-Rote Karte", "grobes Foulspiel".
- **TA-GC-40**: Jede Ereigniszeile zeigt ein kleines Spielerbild in Textgroesse (22 px). Das Rendern
  laeuft asynchron nach dem Einfuegen der Zeile, damit der Ticker nicht darauf wartet.
- **TA-GC-41**: Spiele, deren Log noch keine Minuten an den Zweikaempfen hat (vor dieser Aenderung
  berechnet), zeigen einfach keine Balleroberungen — dieselbe selbstheilende Logik wie bei
  `logHasMinutes`.
- **TA-GC-44**: Der Verletzungstext nennt die Verletzungsart aus `injuryType` (`t('injury.<typ>')`)
  plus die Ausfalldauer. Aeltere Spiele ohne gespeicherte Art fallen auf die reine Dauer zurueck.
- **TA-GC-45**: Ein Umschalter im Fussbereich wechselt zwischen einfacher und doppelter
  Geschwindigkeit. Die Wartezeit wird durch den Faktor geteilt; beim Umschalten wird der laufende
  Timer neu gesetzt, damit die Aenderung sofort spuerbar ist. Am Spielende verschwinden Umschalter
  und Skip-Knopf gemeinsam.

## Gemessene Statistiken (Stand: 2026-04-23)

Ergebnisse aus `server/test/game-statistics.test.js` mit 500 simulierten Spielen pro Konfiguration.

### Spielstil-Statistiken

| Metrik | Aggressiv | Normal | Freundlich | Bundesliga-Ziel |
|---|---|---|---|---|
| Tore/Spiel | 3,21 | 3,20 | 3,21 | 3,16 |
| Gelbe Karten/Spiel | 4,37 | 3,66 | 3,21 | 4,0 / 3,5 / 3,0 |
| Rote Karten/Spiel | 0,142 | 0,094 | 0,058 | 0,13 / 0,10 / 0,07 |
| Unentschieden | 22,8% | 21,8% | 22,6% | 24% |
| Schuesse/Team | 12,8 | 12,9 | 12,9 | 13 |
| Schuesse aufs Tor/Team | 4,7 | 4,7 | 4,8 | 4-5 |

### Angriffsmodus-Statistiken

| Metrik | Offensiv | Balanciert | Defensiv | Bundesliga-Ziel |
|---|---|---|---|---|
| Tore/Spiel | 3,99 | 2,92 | 2,28 | 3,16 |
| Gelbe Karten/Spiel | 4,40 | 3,64 | 2,82 | 3,5 |
| Rote Karten/Spiel | 0,160 | 0,114 | 0,040 | 0,10 |
| Unentschieden | 14,4% | 22,4% | 29,2% | 24% |
| Schuesse/Team | 15,8 | 12,5 | 9,3 | 13 |
| Schuesse aufs Tor/Team | 5,9 | 4,6 | 3,4 | 4-5 |

### Zufalls-Kontrolle (300 Wiederholungen mit identischem Setup)

| Metrik | Wert |
|---|---|
| Einzigartige Ergebnisse | 32 von 300 |
| Ergebnis-Differenz >= 3 Tore zwischen Wiederholungen | 29,5% |
| Team A Tore: Durchschnitt / Max | 1,61 / 6 |
| Team B Tore: Durchschnitt / Max | 1,40 / 6 |
| Gelbe Karten: Durchschnitt / Min / Max | 4,16 / 0 / 10 |
| Rote Karten: Durchschnitt / Max | 0,113 / 2 |

### Staerke-Ungleichgewicht

| Szenario | Ergebnis |
|---|---|
| Starkes Team (Level 70-90) vs. Schwaches Team (Level 10-30) | 100% Siege fuer starkes Team |
| Gleiche Teams (Level 50) | Team A: 36,5%, Team B: 36,0%, Unentschieden: 27,5% |

### Aenderungen gegenueber Vorversion

Folgende Anpassungen wurden vorgenommen, um die Statistiken naeher an die Bundesliga-Referenzwerte zu bringen:

1. **Streak-Cap bei 6**: Verhindert explodierende Schusswahrscheinlichkeiten durch lange Streak-Ketten.
2. **Streak-Multiplikator 0.15** (vorher 0.2): Daempft den Einfluss des Streaks auf die Schusswahrscheinlichkeit.
3. **Schusswahrscheinlichkeiten gesenkt**: Angreifer 0.085 (vorher 0.095), Mittelfeld 0.037 (vorher 0.04).
4. **Schuss-Genauigkeit erhoeht**: `0.25 + level/400` (vorher `0.15 + level/500`). Mehr Schuesse treffen das Tor.
5. **Torwart-Vorteilsfaktor 2.0**: `keeperLevel * 2.0 / (keeperLevel * 2.0 + shooterLevel)`. Kompensiert die hoehere Schuss-Genauigkeit.

### Verbleibende Abweichungen

- **Unentschieden**: Mit 21-23% leicht unter dem Zielwert von 24%.
- **Zufalls-Kontrolle**: Varianz mit 29,5% >= 3 Tore Differenz noch relativ hoch, aber verbessert (vorher 31,8%).
