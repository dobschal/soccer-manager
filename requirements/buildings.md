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
- **US-BLD-06**: Als Spieler sehe ich auf der Gebaeude-Seite unter der Ueberschrift und dem Einleitungstext dieselbe 3D-Szene wie beim Stadion, hier aber zentriert auf die Strassenkreuzung noerdoestlich des Stadions, um die herum meine Gebaeude stehen.
- **US-BLD-07**: Als Spieler sehe ich mein Trainingsgelaende in 3D und erkenne an seinem Aussehen, welche Stufe es hat.
- **US-BLD-08**: Als Spieler sehe ich mein Fitness-Studio in 3D - eine moderne Glashalle mit Leuchtschrift "Gym" ueber dem Eingang. Die Halle selbst wird mit jeder Stufe groesser, ebenso ihr beleuchteter Innenraum, die Geraete, die Solarmodule auf dem Dach und der Parkplatz.

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

Die Gebaeude-Seite zeigt zwischen Einleitungstext und Gebaeudekarten dieselbe Szene wie die
Stadion-Seite (`StadiumCanvas`), nur mit einem anderen Kamera-Ziel. Die Geometrie
der Gebaeude liegt in `client/partials/clubBuildingsScene.js`.

- **TA-BLD-10**: Gemeinsame Szene fuer beide Seiten. Die Stadion-Seite fokussiert den Mittelpunkt des Spielfelds, die Gebaeude-Seite die Strassenkreuzung noerdoestlich des Stadions (`focus: 'buildings'`), inklusive Auto-Rotation um diesen Punkt und Kamera-Umschalter.
- **TA-BLD-11**: Grundstuecke: Die Kreuzung hat vier Quadranten, einer davon ist das Stadion. Trainingsgelaende (aeusseres Eck), Fitness-Studio (Streifen noerdlich des Stadions) und Jugendakademie (Streifen oestlich davon) belegen die drei freien Quadranten. Der Abstand zu den Strassenachsen ist genau halbe Strassenbreite plus Fusswegbreite, sodass die Grundstuecksgrenze exakt auf dem Bordstein liegt. Baeume werden auf Grundstueck und Fussweg ausgespart, die Bodenflaeche waechst mit, damit kein Grundstueck ueber ihren Rand hinausragt.
- **TA-BLD-12**: Entlang der beiden Strassen, an die ein bebautes Grundstueck grenzt, laeuft ein Fussweg mit Strassenlaternen (dieselben wie am Stadion). Er bildet ein L um die kreuzungsseitige Ecke; Laternen werden vor jeder Oeffnung in der Grundstuecksgrenze ausgelassen (Zauntor und Parkplatz-Einfahrt).
- **TA-BLD-13**: Trainingsgelaende Stufe 1: Fussballplatz in Stadion-Groesse (50x30 Einheiten) mit Streifenmuster, Markierungen und zwei Toren, ringsherum ein Maschendrahtzaun mit Tor zur Strasse. Der Zaun steht am westlichen Ende des Grundstuecks und liegt damit auf dem Bordstein der einen Strasse, die Suedseite auf dem der anderen. Beleuchtung: ein Paar niedriger, schwacher Masten in den beiden Zaunecken einer Platzhaelfte - die gegenueberliegende Haelfte bleibt bewusst im Dunkeln. Keine Trainerbaenke, kein Parkplatz.
- **TA-BLD-14**: Trainingsgelaende Stufe 2: zusaetzlich Baelle, Slalomstangen und Huetchen auf dem Platz, ein zweites, hoeheres und deutlich helleres Mastpaar in den beiden anderen Ecken, zwei offene Trainerbaenke am Spielfeldrand und ein Parkplatz mit einer Reihe Parkbuchten.
- **TA-BLD-15**: Trainingsgelaende Stufe 3: hohe Masten in allen vier Ecken, die den Platz spielfeldhell ausleuchten, beide Trainerbaenke ueberdacht und mit verstrebten Glaswaenden verglast, und eine zweite Reihe Parkbuchten.
- **TA-BLD-15c**: Trainerbaenke: zwei Stueck an der Suedseite, links und rechts des Zauntors, gebaut wie die Ersatzbaenke im Stadion (`_createBenches`) - ein grauer Sockel mit einer Reihe hellgrauer Sitze derselben Geometrie wie auf den Tribuenen, zum Platz gewandt. Stufe 3 stellt zusaetzlich ein Flachdach auf vier Pfosten darum, mit Glasscheiben hinten und an beiden Seiten, jede Scheibe von dunklen Streben gerahmt.
- **TA-BLD-15d**: Parkplatz: liegt im Grundstuecksstreifen oestlich des Zauns und ist auf jeder Stufe reserviert, damit Grundstueck, Fussweg und Strassen bei einem Ausbau nicht wandern. Eine Fahrgasse fuehrt von der Suedstrasse nach Norden; Stufe 2 hat eine Reihe markierter Buchten oestlich davon, Stufe 3 eine zweite westlich davon. Die Einfahrt liegt ueber dem Fussweg, sodass der Parkplatz direkt an der Strasse haengt; Strassenlaternen werden dort genauso ausgespart wie vor dem Zauntor.
- **TA-BLD-15b**: Alle Flutlichtmasten stehen in den Ecken des eingezaeunten Gelaendes, diagonal ausserhalb der Spielfeldecken, und leuchten zur Platzmitte. Ihre Lichtstaerke bleibt bewusst unter der des Stadions.
- **TA-BLD-15a**: Das Trainingsgelaende hat auf keiner Stufe Gebaeude oder Nebenplaetze - beides folgt spaeter. Trainerbaenke und Parkplatz zaehlen nicht dazu.
- **TA-BLD-16**: Fitness-Studio: eine moderne Halle am westlichen Ende ihres Grundstuecks, also westlich des Trainingsgelaendes auf der anderen Strassenseite. Glasfassade auf allen vier Seiten, jede Scheibe von Streben gerahmt (Mullions plus zwei umlaufende Riegel), Flachdach mit Attika, dahinter ein einziger grosser Raum. Der Eingang liegt mittig in der strassenseitigen Suedfassade: verglaste Doppeltuer unter einem auskragenden Vordach mit Lichtleiste, davor ein gepflasterter Weg ueber den Fussweg zur Strasse.
- **TA-BLD-16a**: Die Halle waechst mit der Stufe: 18x12x5,5 / 22x14x6,2 / 26x16x7 Einheiten. Das Grundstueck hat immer die Groesse fuer Stufe 3, damit Strassen, Fussweg und Parkplatz bei einem Ausbau nicht wandern, und die Suedfassade bleibt an ihrem Platz - die Halle waechst nach Norden, weg von der Strasse. Eingang, Weg und Sockelkante bleiben dadurch auf jeder Stufe gleich.
- **TA-BLD-17**: Ueber dem Eingang steht gross "Gym" in Leuchtschrift - Neonroehren auf einer dunklen Blende, aus geraden und gebogenen Segmenten gebaut (`GLYPHS` in `clubBuildingsScene.js`). Das G ist eine C-foermige Schale mit weiter Oeffnung rechts, darin ein kurzer Stamm mit einwaerts laufendem Querbalken - ohne die weite Oeffnung liest es sich als kleines "e". Die Schrift fuellt das Fassadenband zwischen Vordach und Dach, wird also mit der Halle kleiner, und leuchtet mit jeder Stufe heller.
- **TA-BLD-18**: Im Innenraum stehen Matten, Laufbaender, Gewichtsstapel, Hanteln auf einem Hantelstaender und Hantelbaenke mit Langhantel. Die Zonen sind fest (Laufbaender an der Nordfassade, Matten in der Westhaelfte, Baenke in der Osthaelfte, Hantelstaender an der Ostwand, Gewichte in der Mitte), ein Ausbau fuellt den Raum nur weiter auf: Stufe 1 hat 2 Laufbaender / 2 Matten / 1 Bank / 6 Hanteln, Stufe 2 das Doppelte, Stufe 3 6 Laufbaender / 6 Matten / 3 Baenke / 14 Hanteln.
- **TA-BLD-19**: Beleuchtung des Fitness-Studios steigt pro Stufe: Deckenpaneele im Raster (2 / 4 / 6 Stueck) mit jeweils staerkerem Licht, dazu die hellere Leuchtschrift. Der Raum ist bewusst hell ausgeleuchtet und leuchtet sichtbar durch die Glasfassade - nach den Flutlichtern das hellste Objekt auf dem Gelaende.
- **TA-BLD-19a**: Auf dem Flachdach stehen angeschraegte Solarmodule (25 Grad nach Sueden geneigt, auf einem kurzen vorderen und einem hohen hinteren Fuss). Auch sie steigern sich pro Stufe: 3 Module in einer Reihe, 6 in zwei Reihen, 10 in zwei Reihen.
- **TA-BLD-20**: Parkplatz des Fitness-Studios: liegt im Grundstuecksstreifen oestlich der Halle, gebaut wie der des Trainingsgelaendes (Fahrgasse von der Suedstrasse, markierte Buchten, Einfahrt ueber den Fussweg). Er waechst pro Stufe: 4 Buchten, 6 Buchten, 12 Buchten in zwei Reihen. Ab Stufe 2 steht ein Lichtmast zwischen Halle und Parkplatz, ab Stufe 3 ein zweiter.
- **TA-BLD-21**: Die Jugendakademie hat ihr Grundstueck reserviert, aber noch keine 3D-Geometrie.

### Tests

- Karten-Wahrscheinlichkeiten pro Gebaeude-Level
- Baukosten und Bauzeit-Validierung
- Bau-Abschluss-Logik (gleiche und unterschiedliche Saisons)
- Upgrade-Validierung (unzureichende Mittel, Max-Level, laufender Bau)
