# Team-Embleme

## Beschreibung

Jedes Team hat ein individuelles SVG-basiertes Emblem, das aus Form, Muster und zwei Farben zusammengesetzt wird. Spieler koennen ihr Emblem ueber einen visuellen Editor anpassen. Bot-Teams erhalten zufaellig generierte Embleme.

## User Stories

- **US-EMB-01**: Als Spieler sehe ich mein Team-Emblem an vielen Stellen im Spiel (Team-Seite, Ergebnisse, Tabelle, Dashboard).
- **US-EMB-02**: Als Spieler kann ich mein Emblem ueber einen visuellen Editor anpassen (Form, Muster, 2 Farben).
- **US-EMB-03**: Als Spieler sehe ich eine Live-Vorschau meines Emblems waehrend der Bearbeitung.
- **US-EMB-04**: Als Spieler sehe ich die Embleme anderer Teams in Ergebnissen und Tabellen.

## Anpassungsoptionen

### Formen (9 verfuegbar)

circle, oval, triangle, shield, shield2, shield3, shield4, shield5, crest, pentagon

### Muster (6 verfuegbar)

| Muster | Beschreibung |
|---|---|
| solid | Einfarbige Fuellung |
| stripes | Vertikale Streifen (2 Farben) |
| horizontalStripes | Horizontale Streifen (2 Farben) |
| quartered | Vier Quadranten abwechselnd (2 Farben) |
| diagonal | Diagonale Teilung (2 Farben) |
| halved | Vertikale Haelfte (2 Farben) |

### Farben (21 verfuegbar)

Palette von Rot, Pink, Orange, Gelb, Braun, Gruen, Cyan, Blau, Lila bis zu Neutraltoenen.

## Technische Anforderungen

### SVG-Generierung

- **TA-EMB-01**: Embleme werden dynamisch als SVG generiert via `generateEmblem()`.
- **TA-EMB-02**: SVG-Struktur: Clip-Path fuer Form, Muster als Fuellung, weisser Rand (Stroke-Width: 4), Banner mit Teamname.
- **TA-EMB-03**: Teamname wird auf einem Banner am unteren Rand angezeigt (letztes Wort, Grossbuchstaben).
- **TA-EMB-04**: Farbhelligkeits-Anpassung fuer Banner-Schattierung: -40% dunkle Falte, -20% Banner-Koerper.

### Datenbank

- **TA-EMB-05**: Emblem in `team.emblem` als TEXT (JSON-Format): `{"shape", "pattern", "color", "color2"}`.
- **TA-EMB-06**: Primaere Emblem-Farbe wird auch in `team.color` gespeichert.

### Groessen-Varianten

| Kontext | Groesse |
|---|---|
| Dashboard-Tabelle | 20px |
| Tabellen-Thumbnails | 24px |
| Mobile Ergebnisse | 60px |
| Desktop Ergebnisse | 120px |
| Editor-Vorschau | 150px |
| Dashboard-Home | 160px |
| Team-Seite | 200px (Standard) |

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `updateEmblem(emblem, color)` | Emblem und Teamfarbe aktualisieren |

### Frontend-Editor

- **TA-EMB-07**: Modal-Overlay mit Live-Vorschau (150px).
- **TA-EMB-08**: Form-Auswahl als Grid mit 40px SVG-Vorschauen.
- **TA-EMB-09**: Muster-Auswahl als Text-Optionen mit Hervorhebung.
- **TA-EMB-10**: Zwei Farb-Picker als 36x36px Farbfeld-Grids.
- **TA-EMB-11**: Speichern-Button mit Toast-Benachrichtigung.

### Bot-Embleme

- **TA-EMB-12**: `generateRandomEmblem()` waehlt zufaellig Form, Muster und 2 verschiedene Farben.
- **TA-EMB-13**: Jedes neue Bot-Team erhaelt bei Erstellung ein zufaelliges Emblem.

### Fallback

- **TA-EMB-14**: Bei ungueltigem JSON: Fallback auf shield/solid-Muster.
- **TA-EMB-15**: Bei fehlender Teamfarbe: Fallback-Farbe `#1a5f7a`.

### Tests

- Emblem-Rendering mit geparsten Parametern
- Standard-Groesse (200px)
- Fallback bei ungueltigem JSON
- Farb-Fallback bei fehlender Teamfarbe
- Responsive Groessen in Spiel-Ergebnissen
