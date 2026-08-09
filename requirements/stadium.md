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
- **TA-STD-23**: OrbitControls: Pan, Zoom, Rotation (Stadion-Ansicht Min: 50, Max: 150 Einheiten; Gebaeude-Ansicht Min: 40, Max: 240).
- **TA-STD-24**: Responsive ueber ResizeObserver.
- **TA-STD-30**: Die Umgebung reicht bis zum Horizont: Bodenflaeche 750x750 Einheiten, Baumbestand bis kurz vor deren Rand, Strassen laufen bis 700 Einheiten hinaus. Entfernungsnebel (300 bis 640 Einheiten, in einem Daemmerungston zwischen warmem und kaltem Horizont) loest alles Weitentfernte auf, sodass weder Bodenkante noch Strassenende sichtbar wird. Nur Baeume innerhalb von 200 Einheiten nehmen an den Schattenpaessen teil.
- **TA-STD-34**: Beleuchtung der Szene: Ambient-Licht plus ein kuehles Mondlicht von oben und eine gerichtete Sonne. Farbe, Staerke und Stand der Sonne sowie die Staerke von Ambient und Mond kommen aus der aktuellen Tageszeit (TA-STD-38). Die Sonne wirft Schatten (TA-STD-42); ihre Staerke bleibt ausser tagsueber unter der der Flutlichter.
- **TA-STD-35**: Der Himmel ist eine Kuppel um die Szene, deren Vertexfarben aus `skyColor()` kommen: waagerecht ein Verlauf zwischen dem warmen Band in Sonnenrichtung und dem kuehlen Gegenhimmel, senkrecht von dort hoch zum Zenit. Die drei Farbstops und die Sonnenrichtung liefert die aktuelle Tageszeit, ein Phasenwechsel faerbt die Kuppel neu. Sie liegt ausserhalb des Nebels (sonst wuerde er sie zu einer Flaeche verflachen) und schreibt keine Tiefe, steht also hinter allem anderen.
- **TA-STD-36**: Die Kamera-Nahebene liegt bei 1 Einheit statt der ueblichen 0,1: Die Strassen reichen bis 700 Einheiten hinaus, und dort blieb bei 0,1 zu wenig Tiefenaufloesung, sodass die Mittelmarkierungen gegen den Asphalt flackerten. Zusaetzlich werden alle weissen Fahrbahn- und Parkplatzmarkierungen per `polygonOffset` in Tiefenpuffer-Einheiten Richtung Kamera vorgezogen - anders als ein fester Hoehenversatz wirkt das in jeder Entfernung gleich.
- **TA-STD-33**: Auf den Strassen fahren Autos (`client/partials/trafficScene.js`): rund 20 Fahrzeuge, gleichmaessig auf die vier Strassen verteilt, Rechtsverkehr auf einer Spur je Richtung. Jedes Auto hat Scheinwerfer und Ruecklichter als leuchtende Linsen plus einen durchscheinenden Lichtkegel auf dem Asphalt - keine echten Lichtquellen, da jede zusaetzliche einen weiteren Renderpass kostet. Karosserie, Kabine, Lichter und Lichtkegel sind je eine InstancedMesh (fuenf Draw Calls insgesamt); pro Frame werden nur die Instanz-Matrizen neu geschrieben. Startpositionen, Farben und Geschwindigkeiten kommen aus dem seeded Generator, sind also bei jedem Aufbau gleich. Die Autos fahren in einem Fenster von 130 Einheiten ueber die Kreuzungen hinaus und beginnen dann wieder vorne; Ampeln gibt es nicht, die beiden Strassenachsen sind lediglich zeitlich gegeneinander versetzt.
- **TA-STD-38**: Die Szene kennt vier Tageszeiten (`CONFIG.daylight`): Morgendaemmerung (Sonne im Osten), Tag, Abenddaemmerung (Sonne im Westen) und Nacht. Jede Phase bringt ihre eigene Sonne (Farbe, Staerke, Stand), Fuell-Beleuchtung (Ambient und Mond), Himmels-Farbstops, Nebel- und Hintergrundfarbe sowie die Angabe, ob Flutlicht brennt. Beim Aufbau waehlt `daylightPhaseFor()` anhand der lokalen Uhrzeit des Spielers die passende Phase (Morgendaemmerung 5-9, Tag 9-18, Abenddaemmerung 18-22, Nacht 22-5).
- **TA-STD-39**: Unter der Animation liegt ein Regler mit vier Stufen in der Reihenfolge des Tages (Morgendaemmerung, Tag, Abenddaemmerung, Nacht), der die Phase manuell wechselt; darueber steht die aktuelle Phase. Er erscheint nur, wo die Animation selbst das Thema ist (Stadion- und Gebaeude-Seite, Option `daylightControl`), die Uhrzeit-Automatik gilt ueberall.
- **TA-STD-40**: Ein Phasenwechsel baut die Szene **nicht** neu, sondern faerbt sie um: Lichtfarben und -staerken, Sonnenstand samt Schattenkamera, Himmelskuppel (Vertexfarben werden neu berechnet), Nebel und Hintergrund. Das Label unter dem Regler wird direkt im DOM aktualisiert, damit die Komponente nicht neu rendert und den WebGL-Kontext verliert.
- **TA-STD-41**: Tagsueber ist das Flutlicht aus: alle Spotlights (Stadion-Masten, Trainingsgelaende, Jugendakademie, Parkplaetze) und alle als `userData.nightOnly` markierten Leuchtmittel (Mast-Linsen, Strassenlaternen-Koepfe, Wegelaternen) werden unsichtbar geschaltet. Das spart nebenbei deren Schattenpaesse.
- **TA-STD-42**: Die Sonne wirft Schatten. Als gerichtetes Licht schattet sie ueber eine orthographische Kamera, die dem Kamera-Ziel folgt (Spielfeldmitte bzw. Kreuzung), damit die Texel dort liegen, wo hingeschaut wird: Box 260 Einheiten um den Fokus, Map 2048x2048. Die Box ist bewusst grosszuegig, weil eine tief stehende Sonne aus einem 40 Einheiten hohen Masten einen rund 150 Einheiten langen Schatten macht - eine engere Box wuerde diese Schweife mitten in der Luft abschneiden. Der Tiefenbereich der Schattenkamera wird bei jedem Phasenwechsel an den neuen Sonnenabstand angepasst. Gegen Shadow-Acne beim streifenden Licht dient vor allem `normalBias` (`CONFIG.sun.shadow`).
- **TA-STD-29**: Dieselbe Szene wird auch auf der Gebaeude-Seite verwendet. Sie enthaelt neben dem Stadion die Gebaeude des Vereins rund um die Strassenkreuzung noerdoestlich davon; das Kamera-Ziel entscheidet, was im Mittelpunkt steht (Spielfeldmitte vs. Kreuzung). Details siehe [Buildings](buildings.md).

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
