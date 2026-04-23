# Spielberechnung (Game Calculation)

## Beschreibung

Die Spielberechnung simuliert ein Fussballspiel Schritt fuer Schritt. Jedes Spiel besteht aus ca. 900 Schritten (90 Spielminuten, 10 Schritte pro Minute), in denen Passen, Kaempfe um den Ball, Schuesse und Tore simuliert werden.

## User Stories

- **US-GC-01**: Als Spieler erwarte ich realistische Spielergebnisse, die den Statistiken der Bundesliga aehneln.
- **US-GC-02**: Als Spieler kann ich die Spieldetails einsehen (Tore, Schuesse, Ballbesitz, Karten, Aufstellungen).
- **US-GC-03**: Als Spieler sehe ich, dass meine taktischen Entscheidungen (Angriffsmodus, Spielstil) die Ergebnisse beeinflussen.
- **US-GC-04**: Als Spieler erwarte ich, dass staerkere Teams haeufiger gewinnen, aber Ueberraschungen moeglich sind.

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

### Numerische Unterzahl

- **TA-GC-23**: Pro fehlendem Spieler (Platzverweis) 2% Ballverlust-Wahrscheinlichkeit pro Schritt.

### Pokal-Spiele

- **TA-GC-24**: Kein Unentschieden erlaubt - Verlaengerung bis ein Tor faellt.

### Datenspeicherung

- **TA-GC-25**: Komplettes `gameDetails`-Objekt als JSON in `game.details` gespeichert.
- **TA-GC-26**: Enthaelt: Log-Events, Tore, Staerke, Schuesse, Stadion-Details, Aufstellungen, Karten.

### Tests

- Statistische Validierung ueber 500+ Spiele gegen Bundesliga-Zielwerte
- Spielstil-Auswirkungen (Aggressiv vs. Normal vs. Freundlich)
- Angriffsmodus-Auswirkungen (Offensiv vs. Balanciert vs. Defensiv)
- Zufalls-Kontrolle (zwei identische Spiele sollen unterschiedliche, aber aehnliche Ergebnisse liefern)
- Staerke-Ungleichgewicht (staerkeres Team gewinnt haeufiger)

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
