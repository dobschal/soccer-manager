# Gebaeude

## Beschreibung

Gebaeude sind ausbaubare Infrastruktur-Elemente, die dem Team Boni verschaffen. Aktuell gibt es zwei Gebaeudetypen: Trainingsgelaende und Fitness-Studio. Beide beeinflussen die Wahrscheinlichkeit, bestimmte Aktionskarten zu erhalten.

## User Stories

- **US-BLD-01**: Als Spieler kann ich meine Gebaeude und deren aktuelle Level auf der Gebaeude-Seite einsehen.
- **US-BLD-02**: Als Spieler kann ich ein Gebaeude upgraden, wenn ich genuegend Geld habe und es nicht bereits im Bau ist.
- **US-BLD-03**: Als Spieler sehe ich den Baufortschritt mit verbleibenden Spieltagen waehrend der Bauphase.
- **US-BLD-04**: Als Spieler sehe ich eine "Max Level"-Markierung, wenn ein Gebaeude das hoechste Level erreicht hat.
- **US-BLD-05**: Als Spieler erhalte ich nach Fertigstellung eines Upgrades eine Log-Nachricht.

## Gebaeudetypen

### Trainingsgelaende (Training Area)

Verbessert die Wahrscheinlichkeit, Level-Up-Karten zu erhalten.

| Level | Kosten | Bauzeit | LEVEL_UP_40 | LEVEL_UP_70 | LEVEL_UP_100 |
|---|---|---|---|---|---|
| 0 (kein Gebaeude) | - | - | 0.2 | 0 | 0 |
| 1 (Basis) | 375.000 Euro | 5 Spieltage | 1.2 | 0 | 0 |
| 2 (Fortgeschritten) | 1.125.000 Euro | 10 Spieltage | 1.2 | 0.3 | 0 |
| 3 (Professionell) | 3.000.000 Euro | 17 Spieltage | 1.2 | 0.3 | 0.06 |

### Fitness-Studio (Fitness Studio)

Verbessert die Wahrscheinlichkeit, Fitness-Karten zu erhalten.

| Level | Kosten | Bauzeit | FRESHNESS_5 | FRESHNESS_10 | FRESHNESS_20 |
|---|---|---|---|---|---|
| 0 (kein Gebaeude) | - | - | 0 | 0.5 | 0 |
| 1 (Basis) | 300.000 Euro | 4 Spieltage | 0.6 | 0.88 | 0 |
| 2 (Fortgeschritten) | 900.000 Euro | 8 Spieltage | 0.6 | 0.88 | 0.15 |
| 3 (Professionell) | 2.625.000 Euro | 15 Spieltage | 0.6 | 0.88 | 0.3 |

## Technische Anforderungen

### Datenbank

- **TA-BLD-01**: Tabelle `building` mit Feldern: `id`, `team_id`, `type`, `level`, `construction_end_game_day`, `construction_end_season`, `construction_target_level`, `created_at`.
- **TA-BLD-02**: Unique Key auf `(team_id, type)` - nur ein Gebaeude pro Typ pro Team.
- **TA-BLD-03**: Neue Teams starten mit Trainingsgelaende (Level 1) und Fitness-Studio (Level 1).

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getBuildings` | Gibt alle Gebaeude mit Bau-Status und Karten-Wahrscheinlichkeiten zurueck |
| `upgradeBuilding(buildingType)` | Startet ein Upgrade (validiert Balance, Bau-Status, Max-Level) |

### Bau-Logik

- **TA-BLD-04**: Bauzeit-Berechnung abhaengig vom Upgrade-Level (3-17 Spieltage).
- **TA-BLD-05**: Bauarbeiten koennen Saisongrenzen ueberschreiten (automatische Berechnung).
- **TA-BLD-06**: `completeBuildingConstructions()` wird bei jedem Spieltag aufgerufen und schliesst fertige Bauten ab.

### Frontend

- **TA-BLD-07**: Gebaeudekarten mit Bild (verschiedene Level-Varianten), Beschreibung und Upgrade-Button.
- **TA-BLD-08**: Bau-Badge mit verbleibenden Spieltagen waehrend der Konstruktion.
- **TA-BLD-09**: Deaktivierte Eingabefelder fuer Gebaeude im Bau.

### Tests

- Karten-Wahrscheinlichkeiten pro Gebaeude-Level
- Baukosten und Bauzeit-Validierung
- Bau-Abschluss-Logik (gleiche und unterschiedliche Saisons)
- Upgrade-Validierung (unzureichende Mittel, Max-Level, laufender Bau)
