# Spielmodi (Game Modes)

## Beschreibung

Das Spiel bietet drei Spielmodi: Liga, Pokal und Freundschaftsspiele. Jeder Modus hat eigene Regeln bezueglich Planung, Ergebnisauswirkungen, Fitness-Verlust und Karten-Verfolgung.

## User Stories

### Liga

- **US-GM-01**: Als Spieler nehme ich an einer hierarchischen Liga mit 34 Spieltagen pro Saison teil (Hin- und Rueckrunde).
- **US-GM-02**: Als Spieler sehe ich die Tabelle meiner Liga mit Punkten, Tordifferenz und Position.
- **US-GM-03**: Als Spieler kann ich nach Saisonende auf- oder absteigen (Top 2 steigen auf, Letzte 4 steigen ab).
- **US-GM-04**: Als Spieler kann ich Ergebnisse, Tabellen, Torschuetzenlisten und Teamstatistiken einsehen.

### Pokal

- **US-GM-05**: Als Spieler nehme ich an einem K.O.-Turnier teil, das parallel zur Liga laeuft.
- **US-GM-06**: Als Spieler sehe ich das Pokal-Bracket mit allen Runden und Ergebnissen.
- **US-GM-07**: Als Spieler erhalte ich Preisgeld pro Pokal-Runde (25.000 Euro Basis, verdoppelt sich pro Runde) und 2.000.000 Euro fuer den Pokal-Sieg.
- **US-GM-08**: Als Spieler kann ich Pokal-Ergebnisse vergangener Saisons einsehen.

### Freundschaftsspiele

- **US-GM-09**: Als Spieler kann ich ein Freundschaftsspiel pro Tag initiieren, gegen ein beliebiges Team.
- **US-GM-10**: Als Spieler kann ich einen zufaelligen Gegner fuer ein Freundschaftsspiel waehlen.

## Vergleich der Spielmodi

| Aspekt | Liga | Pokal | Freundschaftsspiel |
|---|---|---|---|
| Haeufigkeit | 34 Spieltage/Saison | ~7 Runden/Saison | Max. 1/Tag |
| Beeinflusst Tabelle | Ja | Nein | Nein |
| Auf-/Abstieg | Ja | Nein | Nein |
| Fitness-Verlust | 8-12% | 8-12% | 4-6,5% |
| Karten-Verfolgung | Ja | Ja | Nein |
| Preisgeld | Keins | 25K-2M Euro | Keins |
| Unentschieden moeglich | Ja | Nein (Verlaengerung) | Ja |
| Stadion-Einnahmen | 100% | 100% (Heimteam) | 50% |

## Technische Anforderungen

### Liga-System

- **TA-GM-01**: Hierarchische Struktur: Level 0 = oberste Liga, `2^level` Ligen pro Level.
- **TA-GM-02**: Jede Liga enthaelt bis zu 18 Teams.
- **TA-GM-03**: Liga-Namen: Kombination aus Divisions-Nummer und Himmelsrichtung (z.B. "2. Sued").
- **TA-GM-04**: Round-Robin-Spielplan: Jedes Team spielt gegen jedes andere 2x (heim/auswaerts).
- **TA-GM-05**: Punktesystem: Sieg = 3, Unentschieden = 1, Niederlage = 0.
- **TA-GM-06**: Tabellen-Sortierung: Punkte > Tordifferenz > Geschossene Tore.
- **TA-GM-07**: Tabelle wird nach jedem Spieltag in `standing_cache` gecacht.

### Auf-/Abstieg

- **TA-GM-08**: Top 2 Teams steigen auf (ausser Level 0).
- **TA-GM-09**: Letzte 4 Teams steigen ab (ausser Maximum-Level).
- **TA-GM-10**: Ausfuehrung am Saisonende, wenn alle Liga-Spiele gespielt sind.

### Pokal

- **TA-GM-11**: K.O.-System mit `cup_round`-Werten als 2er-Potenzen (64, 32, 16, 8, 4, 2, 1).
- **TA-GM-12**: Teams mit hoeherem Liga-Level erhalten Freilose in der 1. Runde.
- **TA-GM-13**: Pokal-Spieltage werden zwischen Liga-Spieltagen eingeplant.
- **TA-GM-14**: Keine Unentschieden - Verlaengerung bis ein Tor faellt.
- **TA-GM-15**: Preisgeld: `25.000 * (maxRunde / aktuelleRunde)` pro Runde + 2.000.000 Euro fuer Pokal-Sieger.

### Freundschaftsspiele

- **TA-GM-16**: Max. 1 Freundschaftsspiel pro Team pro Tag.
- **TA-GM-17**: Halbe Stadion-Zuschauer/Einnahmen.
- **TA-GM-18**: Halber Fitness-Verlust (4-6,5% statt 8-12%).
- **TA-GM-19**: Keine Karten-Verfolgung oder Sperren.
- **TA-GM-20**: Nur das initiierende Team verliert Fitness.

### Datenbank

- **TA-GM-21**: `game`-Tabelle mit `game_type` ('league', 'cup', 'friendly') und `cup_round`.
- **TA-GM-22**: `standing_cache` fuer gecachte Tabellen.
- **TA-GM-23**: `player_season_stats` fuer Torschuetzen und Karten pro Saison/Liga.

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getResults(gameDay, season, level, league)` | Liga-Ergebnisse eines Spieltags |
| `getStanding(gameDay, season, level, league)` | Tabelle nach Spieltag |
| `getTopScorers(season, level, league, limit)` | Torschuetzenliste |
| `getGamesForSlider(pastCount, upcomingCount)` | Letzte/kommende Spiele fuer Dashboard |
| `getCupResults(season, round)` | Pokal-Ergebnisse einer Runde |
| `getCupBracket(season)` | Pokal-Turnierbaum |
| `playFriendlyMatch(opponentTeamId)` | Freundschaftsspiel starten |
| `playRandomFriendly()` | Zufaelliges Freundschaftsspiel |

### Frontend

- **TA-GM-24**: Ergebnis-Seite mit drei Tabs: Liga, Pokal, Freundschaftsspiele.
- **TA-GM-25**: Dashboard-Slider fuer Liga-, Pokal- und Freundschaftsspiel-Ergebnisse.
- **TA-GM-26**: Saison- und Runden-Navigation im Pokal-Tab.
