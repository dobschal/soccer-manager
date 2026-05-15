# Stadion

## Beschreibung

Jedes Team besitzt ein Stadion mit vier Tribuenen (Nord, Sued, Ost, West), die individuell ausgebaut werden koennen. Das Stadion generiert Einnahmen durch Ticketverkaeufe bei Heimspielen. Eine 3D-Visualisierung mit Three.js zeigt das Stadion interaktiv.

## User Stories

- **US-STD-01**: Als Spieler sehe ich mein Stadion als interaktive 3D-Visualisierung, die ich drehen und zoomen kann.
- **US-STD-02**: Als Spieler kann ich Ticketpreise fuer jede Tribuene einzeln festlegen (1-100 Euro).
- **US-STD-03**: Als Spieler kann ich Tribuenen ausbauen (Kapazitaet erhoehen, Dach hinzufuegen).
- **US-STD-04**: Als Spieler sehe ich die Baukosten und Bauzeit vor dem Start einer Erweiterung.
- **US-STD-05**: Als Spieler sehe ich den Baufortschritt mit verbleibenden Spieltagen.
- **US-STD-06**: Als Spieler sehe ich die Zuschauerzahlen der letzten 5 Heimspiele pro Tribuene.
- **US-STD-07**: Als Spieler sehe ich die Bau-Historie meines Stadions.

## Tribuenen-Grenzen

| Tribuene | Min. Kapazitaet | Max. Kapazitaet |
|---|---|---|
| Nord | 200 | 30.000 |
| Sued | 200 | 30.000 |
| Ost | 100 | 15.000 |
| West | 100 | 15.000 |

## Technische Anforderungen

### Zuschauer- und Einnahmen-Berechnung

- **TA-STD-01**: Zuschauer pro Tribuene: `min(kapazitaet, staerkeFaktor * preisFaktor * dachFaktor)`.
- **TA-STD-02**: Staerkefaktor: `(staerkeTeamA * staerkeTeamB) / 80`.
- **TA-STD-03**: Preisfaktor: `(15 / preis)^2` - optimaler Preis bei 15 Euro.
- **TA-STD-04**: Dachfaktor: 1.2x Bonus wenn Dach vorhanden, sonst 1.0.
- **TA-STD-05**: Einnahmen pro Tribuene: `zuschauer * ticketPreis`.
- **TA-STD-06**: Freundschaftsspiele: 50% reduzierte Zuschauer.
- **TA-STD-07**: Tribuene im Bau: 0 Zuschauer und 0 Einnahmen.

### Ausbau-Kosten

- **TA-STD-08**: Preis pro Sitz: 1.000 Euro.
- **TA-STD-09**: Dach-Aufpreis: max(300.000 Euro, Basiskosten * 1.2).
- **TA-STD-10**: Architektengebuehr: 200.000 Euro pauschal.
- **TA-STD-11**: Tribuenen koennen nicht verkleinert werden.
- **TA-STD-12**: Daecher koennen nicht entfernt werden.

### Bauzeit

- **TA-STD-13**: Bauzeit: `max(4, ceil(sitzDifferenz / 600))` Spieltage.
- **TA-STD-14**: Dach-Aufschlag: +3 Spieltage.
- **TA-STD-15**: Bauarbeiten koennen Saisongrenzen ueberschreiten. Die tatsaechliche Saisonlaenge (Liga- plus Pokal-Spieltage) wird beim Berechnen des End-Spieltags beruecksichtigt, sodass Bauten mit gleicher Dauer unabhaengig vom Startzeitpunkt gleich lange dauern.
- **TA-STD-16**: `completeStadiumConstructions()` prueft bei jedem Spieltag auf fertige Bauten.

### Datenbank

- **TA-STD-17**: Tabelle `stadium` mit pro Tribuene: `{stand}_stand_size`, `{stand}_stand_price`, `{stand}_stand_roof`, `{stand}_construction_end_game_day`, `{stand}_construction_end_season`, `{stand}_construction_target_size`, `{stand}_construction_target_roof`.
- **TA-STD-18**: Tabelle `stadium_construction_history` fuer Bau-Historie.

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getStadium` | Stadion mit Bau-Status abrufen |
| `getStadiumByTeamId(teamId)` | Stadion eines beliebigen Teams |
| `calculateStadiumPrice(stadium)` | Kosten und Bauzeit berechnen |
| `buildStadium(stadium)` | Ausbau starten |
| `updatePrices(stadium)` | Ticketpreise aktualisieren |
| `getStadiumAttendance` | Zuschauerzahlen der letzten 5 Heimspiele |
| `getConstructionHistory` | Bau-Historie |

### 3D-Visualisierung (Three.js)

- **TA-STD-19**: Spielfeld mit Markierungen, Teamfarb-Flaggen und Streifenmuster.
- **TA-STD-20**: Tribuenen mit instanziierten Sitzen (5 Farben, dynamische Hoehe).
- **TA-STD-21**: Optionales Dach-System pro Tribuene mit Stuetzen und Kabeln.
- **TA-STD-22**: 4 Flutlichtmasten (je 6 Spots, Schatten bei 1024x1024 Aufloesung).
- **TA-STD-23**: OrbitControls: Pan, Zoom, Rotation (Min: 50, Max: 150 Einheiten).
- **TA-STD-24**: Responsive ueber ResizeObserver.

### Frontend

- **TA-STD-25**: Ticketpreise: 4 Nummernfelder (1-100) mit Speichern/Abbrechen.
- **TA-STD-26**: Erweiterungs-Formular: 4 Groessenfelder + 4 Dach-Checkboxen, Echtzeit-Kostenberechnung (debounced 500ms).
- **TA-STD-27**: Zuschauer-Tabelle: Letzte 5 Heimspiele mit Auslastung pro Tribuene.
- **TA-STD-28**: Bau-Historie-Tabelle mit "In Progress"-Badge fuer laufende Bauten.

### Tests

- Zuschauer- und Einnahmenberechnung (Dach-Bonus, Preisfaktor)
- Baukosten und Bauzeit
- Bau-Abschluss (gleiche und verschiedene Saisons)
- Stadion-Seite mit Phasen: vor Bau, waehrend Bau, nach Fertigstellung
