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

## Verfuegbare Formationen

| Formation | Verteidigung | Mittelfeld | Angriff |
|---|---|---|---|
| 352 | 3 (LD, CD, RD) | 5 (DM, DM, LM, RM, OM) | 2 (LA, RA) |
| 343a | 3 (LD, CD, RD) | 4 (DM, CM, CM, LM/RM) | 3 (LA, CA, RA) |
| 343b | 3 (LD, CD, RD) | 4 (CM, CM, LM, RM) | 3 (LA, CA, RA) |
| 451a | 4 (LD, CD, CD, RD) | 5 (DM, CM, LM, RM, OM) | 1 (CA) |
| 451b | 4 (LD, CD, CD, RD) | 5 (DM, DM, LM, RM, OM) | 1 (CA) |
| 442a | 4 (LD, CD, CD, RD) | 4 (DM, OM, LM, RM) | 2 (LA, RA) |
| 442b | 4 (LD, CD, CD, RD) | 4 (CM, CM, LM, RM) | 2 (LA, RA) |
| 433 | 4 (LD, CD, CD, RD) | 3 (CM, LM, RM) | 3 (LA, CA, RA) |
| 541 | 5 (LD, CD, CD, CD, RD) | 4 (CM, CM) | 1 (CA) |
| 532 | 5 (LD, CD, CD, CD, RD) | 3 (CM, LM, RM) | 2 (LA, RA) |

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
- **TA-LIN-10**: Modifikatoren: Frische-Multiplikator, Starspieler +10%, Motivationsrede +10%, Kapitaens-Bonus, Bot -10%.

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
- **TA-LIN-18**: Klick auf Position oeffnet Spielerauswahl-Overlay (nur passende, nicht-gesperrte Spieler).
- **TA-LIN-19**: Formations-Dropdown mit 10 Optionen.
- **TA-LIN-20**: Team-Info-Karte: Gesamtgehalt, Durchschnittslevel, Durchschnittsalter, Kaderstaerke, Aufstellungsstaerke.

### Tests

- Aufstellung speichern und Spieler-Positionen aktualisieren
- Kapitaen-Logik (Setzen, Loeschen bei Entfernung aus Aufstellung)
- Formationswechsel loescht Positionen
- Taktik-Einstellungen validieren
