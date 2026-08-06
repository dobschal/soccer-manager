# Gebaeude

## Beschreibung

Gebaeude sind ausbaubare Infrastruktur-Elemente, die dem Team Boni verschaffen. Aktuell gibt es drei Gebaeudetypen: Trainingsgelaende, Fitness-Studio und Jugendakademie. Alle drei beeinflussen die Wahrscheinlichkeit, bestimmte Aktionskarten zu erhalten.

Die Jugendakademie ist in einem eigenen Dokument beschrieben: [Youth Academy](youth-academy.md).

## User Stories

- **US-BLD-01**: Als Spieler kann ich meine Gebaeude und deren aktuelle Level auf der Gebaeude-Seite einsehen.
- **US-BLD-02**: Als Spieler kann ich ein Gebaeude upgraden, wenn ich genuegend Geld habe und es nicht bereits im Bau ist.
- **US-BLD-03**: Als Spieler sehe ich den Baufortschritt mit verbleibenden Spieltagen waehrend der Bauphase.
- **US-BLD-04**: Als Spieler sehe ich eine "Max Level"-Markierung, wenn ein Gebaeude das hoechste Level erreicht hat.
- **US-BLD-05**: Als Spieler erhalte ich nach Fertigstellung eines Upgrades eine Log-Nachricht.
- **US-BLD-06**: Als Spieler sehe ich oben auf der Gebaeude-Seite dieselbe 3D-Szene wie beim Stadion, hier aber zentriert auf die Strassenkreuzung noerdoestlich des Stadions, um die herum meine Gebaeude stehen.
- **US-BLD-07**: Als Spieler sehe ich mein Trainingsgelaende in 3D und erkenne an seinem Aussehen, welche Stufe es hat.

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

### Jugendakademie (Youth Academy)

Erhoeht Stufe und Anzahl der Jugendspieler-Karten und schaltet Trainings-Slots frei.
Jedes Team startet auf Level 1, ein Level 0 existiert nicht.

| Level | Kosten | Bauzeit | Karte |
|---|---|---|---|
| 1 (Basis, Startlevel) | – | – | NEW_YOUTH_PLAYER_1 (0.06) |
| 2 (Fortgeschritten) | 3.000.000 Euro | 10 Spieltage | NEW_YOUTH_PLAYER_2 (0.09) |
| 3 (Elite) | 9.000.000 Euro | 17 Spieltage | NEW_YOUTH_PLAYER_3 (0.12) |

Details siehe [Youth Academy](youth-academy.md).

## Technische Anforderungen

### Datenbank

- **TA-BLD-01**: Tabelle `building` mit Feldern: `id`, `team_id`, `type`, `level`, `construction_end_game_day`, `construction_end_season`, `construction_target_level`, `created_at`.
- **TA-BLD-02**: Unique Key auf `(team_id, type)` - nur ein Gebaeude pro Typ pro Team.
- **TA-BLD-03**: Neue Teams starten mit Trainingsgelaende (Level 1), Fitness-Studio (Level 1) und Jugendakademie (Level 1).
- **TA-BLD-10**: `BUILDING_UPGRADES` enthaelt fuer die Jugendakademie nur `youth_academy_2` und `youth_academy_3` — es gibt keinen `_1`-Eintrag, weil Level 1 der Startzustand ist.

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getBuildings` | Gibt alle Gebaeude mit Bau-Status und Karten-Wahrscheinlichkeiten zurueck (inkl. `youthAcademyCardChances`) |
| `upgradeBuilding(buildingType)` | Startet ein Upgrade (validiert Balance, Bau-Status, Max-Level); `buildingType` ist `training_area`, `fitness_studio` oder `youth_academy` |

### Bau-Logik

- **TA-BLD-04**: Bauzeit-Berechnung abhaengig vom Upgrade-Level (3-17 Spieltage).
- **TA-BLD-05**: Bauarbeiten koennen Saisongrenzen ueberschreiten (automatische Berechnung).
- **TA-BLD-06**: `completeBuildingConstructions()` wird bei jedem Spieltag aufgerufen und schliesst fertige Bauten ab.

### Frontend

- **TA-BLD-07**: Drei Gebaeudekarten mit Bild (verschiedene Level-Varianten), Beschreibung und Upgrade-Button.
- **TA-BLD-08**: Bau-Badge mit verbleibenden Spieltagen waehrend der Konstruktion.
- **TA-BLD-09**: Deaktivierte Eingabefelder fuer Gebaeude im Bau.

### 3D-Ansicht (Three.js)

Die Gebaeude-Seite zeigt oberhalb der Gebaeudekarten dieselbe Szene wie die
Stadion-Seite (`StadiumCanvas`), nur mit einem anderen Kamera-Ziel. Die Geometrie
der Gebaeude liegt in `client/partials/clubBuildingsScene.js`.

- **TA-BLD-10**: Gemeinsame Szene fuer beide Seiten. Die Stadion-Seite fokussiert den Mittelpunkt des Spielfelds, die Gebaeude-Seite die Strassenkreuzung noerdoestlich des Stadions (`focus: 'buildings'`), inklusive Auto-Rotation um diesen Punkt und Kamera-Umschalter.
- **TA-BLD-11**: Grundstuecke: Die Kreuzung hat vier Quadranten, einer davon ist das Stadion. Trainingsgelaende (aeusseres Eck), Fitness-Studio (Streifen noerdlich des Stadions) und Jugendakademie (Streifen oestlich davon) belegen die drei freien Quadranten mit 8 Einheiten Abstand zur Kreuzung. Baeume werden auf Grundstuecken ausgespart, die Bodenflaeche waechst mit, damit kein Grundstueck ueber ihren Rand hinausragt.
- **TA-BLD-12**: Jedes Grundstueck ist ueber einen beleuchteten Fussweg an die naechste Strasse angebunden.
- **TA-BLD-13**: Trainingsgelaende Stufe 1: Fussballplatz mit Streifenmuster, Markierungen und zwei Toren, ringsherum ein Maschendrahtzaun mit Tor zur Strasse, dazu ein Paar niedriger, schwacher Flutlichtmasten.
- **TA-BLD-14**: Trainingsgelaende Stufe 2: zusaetzlich Baelle, Slalomstangen und Huetchen auf dem Platz sowie ein zweites, hoeheres und deutlich helleres Mastpaar.
- **TA-BLD-15**: Trainingsgelaende Stufe 3: hohe, sehr helle Masten plus Trainingszentrum — Vereinsgebaeude mit beleuchteten Fenstern, ueberdachte Trainerbank am Spielfeldrand und ein separater Torwartplatz mit zwei Minitoren, eigenem Mast und Hofleuchten.
- **TA-BLD-16**: Fitness-Studio und Jugendakademie haben ihr Grundstueck reserviert, aber noch keine 3D-Geometrie.

### Tests

- Karten-Wahrscheinlichkeiten pro Gebaeude-Level
- Baukosten und Bauzeit-Validierung
- Bau-Abschluss-Logik (gleiche und unterschiedliche Saisons)
- Upgrade-Validierung (unzureichende Mittel, Max-Level, laufender Bau)
