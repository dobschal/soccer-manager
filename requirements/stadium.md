# Stadion

## Beschreibung

Jedes Team besitzt ein Stadion mit vier Tribuenen (Nord, Sued, Ost, West), die individuell ausgebaut werden koennen. Das Stadion generiert Einnahmen durch Ticketverkaeufe bei Heimspielen. Eine 3D-Visualisierung mit Three.js zeigt das Stadion interaktiv.

## User Stories

- **US-STD-01**: Als Spieler sehe ich mein Stadion als interaktive 3D-Visualisierung, die ich drehen und zoomen kann.
- **US-STD-02**: Als Spieler kann ich Ticketpreise fuer jede Tribuene einzeln festlegen (1-100 Euro).
- **US-STD-03**: Als Spieler kann ich Tribuenen ausbauen (Kapazitaet erhoehen, Dach hinzufuegen oder abreissen).
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
| Ecke (NO, NW, SO, SW) | 50 | 4.000 |

## Technische Anforderungen

### Zuschauer- und Einnahmen-Berechnung

- **TA-STD-01**: Zuschauer pro Tribuene: `min(kapazitaet, staerkeFaktor * preisFaktor * dachFaktor)`.
- **TA-STD-02**: Staerkefaktor: `(staerkeTeamA * staerkeTeamB) / 80`.
- **TA-STD-03**: Preisfaktor: `(15 / preis)^2` - optimaler Preis bei 15 Euro.
- **TA-STD-04**: Dachfaktor: 1.2x Bonus wenn Dach vorhanden, sonst 1.0.
- **TA-STD-05**: Einnahmen pro Tribuene: `zuschauer * ticketPreis`.
- **TA-STD-06**: Freundschaftsspiele: 50% reduzierte Zuschauer.
- **TA-STD-07**: Tribuene im Bau: 0 Zuschauer und 0 Einnahmen.

### Heim-Bonus (Zuschauer-Effekt auf Team-Staerke)

- **TA-STD-29**: Zuschauer-Bonus: linear `+1%` pro 6.000 Zuschauer, gedeckelt bei `+10%` ab 60.000 Zuschauern.
- **TA-STD-30**: Auslastungs-Malus: wenn das Stadion unter 50% gefuellt ist, linear bis `-10%` bei 0% Auslastung (z.B. 25% Auslastung = `-5%`, 50% Auslastung = `0%`). Stehende Tribuenen im Bau zaehlen nicht zur operativen Kapazitaet.
- **TA-STD-31**: Bonus und Malus werden addiert und als Multiplikator auf die Spieler-Stufen der Heimmannschaft angewendet, *nach* allen sonstigen Modifikatoren (Frische, Star, Position, Motivationsrede, Kapitaen, Bot-Malus).
- **TA-STD-32**: Der Bonus gilt fuer Liga-, Pokal- und Freundschaftsspiele und wird in `stadiumDetails.homeBonusPct` / `stadiumDetails.homeBonusMultiplier` mitgeliefert.

### Ausbau-Kosten

- **TA-STD-08**: Progressive Sitzpreise pro Tribuene, basierend auf der aktuellen Tribuenen-Groesse zu Baubeginn:
  - Sitze 0 bis 2.000: 500 Euro pro Sitz
  - Sitze 2.001 bis 10.000: 1.000 Euro pro Sitz
  - Sitze 10.001 bis 20.000: 1.500 Euro pro Sitz
  - Sitze ab 20.001: 2.000 Euro pro Sitz

  Die Staffel wird marginal angewendet: ein Ausbau, der eine Schwelle ueberschreitet, zahlt fuer den Teil unterhalb der Schwelle den niedrigeren Preis und fuer den Teil oberhalb den hoeheren Preis.
- **TA-STD-09**: Dach-Aufpreis fuer ein neues Dach: max(300.000 Euro, Basiskosten * 1.2).
- **TA-STD-09a**: Dach-Verlaengerung: Wird eine bereits ueberdachte Tribuene vergroessert und behaelt ihr Dach, kostet die Verlaengerung zusaetzlich max(100.000 Euro, Kosten der neuen Plaetze * 0.2).
- **TA-STD-10**: Architektengebuehr: 50.000 Euro pauschal pro Bau-Aktion.
- **TA-STD-11**: Tribuenen koennen nicht verkleinert werden.
- **TA-STD-12**: Daecher koennen abgerissen werden (Haekchen entfernen); der Abriss ist kostenlos.

### Bauzeit

- **TA-STD-13**: Bauzeit: `max(8, ceil(sitzDifferenz / 300))` Spieltage.
- **TA-STD-14**: Dach-Aufschlag: +6 Spieltage.
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
- **TA-STD-26**: Ausbau-Overlay (Button "Stadion Ausbauen" unter den Baumassnahmen): 8 Groessenfelder + 8 Dach-Checkboxen. Preis und Vorschau erscheinen erst nach Klick auf "Stadion berechnen"; bei ungueltiger Eingabe wird weder Preis noch Vorschau gezeigt. Die Vorschau ist eine 3D-Ansicht des geplanten Stadions mit langsam rotierender Kamera ohne Steuerung, darunter "Bau beauftragen".
- **TA-STD-27**: Zuschauer-Tabelle: Letzte 5 Heimspiele mit Auslastung pro Tribuene.
- **TA-STD-28**: Bau-Historie-Tabelle mit "In Progress"-Badge fuer laufende Bauten.

### Tests

- Zuschauer- und Einnahmenberechnung (Dach-Bonus, Preisfaktor)
- Baukosten und Bauzeit
- Bau-Abschluss (gleiche und verschiedene Saisons)
- Stadion-Seite mit Phasen: vor Bau, waehrend Bau, nach Fertigstellung
