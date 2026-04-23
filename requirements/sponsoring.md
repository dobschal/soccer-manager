# Sponsoring

## Beschreibung

Teams koennen Sponsorenvertraege abschliessen, um regelmaessige Einnahmen pro Spieltag zu erhalten. Die Hoehe der Sponsorengelder haengt von der Vertragslaenge, dem Liga-Level und der aktuellen Siegquote ab.

## User Stories

- **US-SPO-01**: Als Spieler kann ich aus 4 Sponsorenangeboten mit unterschiedlichen Laufzeiten waehlen.
- **US-SPO-02**: Als Spieler sehe ich meinen aktiven Sponsor mit verbleibenden Vertragstagen auf der Finanzseite.
- **US-SPO-03**: Als Spieler erhalte ich nach jedem Spieltag automatisch das Sponsorengeld.
- **US-SPO-04**: Als Spieler erhalte ich eine Dringlichkeitsmeldung auf dem Dashboard, wenn kein Sponsor aktiv ist.
- **US-SPO-05**: Als Spieler sehe ich Sponsorenzahlungen in meiner Finanzuebersicht.

## Vertragsoptionen

| Vertragsdauer | Beschreibung |
|---|---|
| 3 Spieltage | Kuerzester Vertrag |
| 9 Spieltage | Kurzer Vertrag |
| 16 Spieltage | Mittlerer Vertrag |
| 34 Spieltage | Volle Saison |

## Einnahmen-Berechnung

```
Basis pro Spieltag = 76.124 Euro (deckt 11 Spieler auf Level 10)
Pro Liga-Level unter 1: * 0.8 (20% Reduktion)
Siegquoten-Multiplikator: max(1/3, gewonneneSpiele / vertragslaenge)
Zufallsfaktor: 90-110% Varianz
```

## Technische Anforderungen

### Angebotslogik

- **TA-SPO-01**: 4 Angebote pro Abruf (je eines pro Vertragslaenge).
- **TA-SPO-02**: Angebote werden 24 Stunden gecacht (pro Team).
- **TA-SPO-03**: Cache wird beim Vertragsabschluss geloescht.
- **TA-SPO-04**: Sponsornamen werden zufaellig aus 37 verfuegbaren Namen gewaehlt.
- **TA-SPO-05**: Angebotswert steigt mit Siegquote der letzten 34 Spiele.

### Vertragsverwaltung

- **TA-SPO-06**: Nur 1 aktiver Sponsor pro Team.
- **TA-SPO-07**: Vertragsdauer berechnet als: `startSaison * 34 + startSpieltag + dauer`.
- **TA-SPO-08**: Vertraege koennen Saisongrenzen ueberschreiten.
- **TA-SPO-09**: Kein automatischer Vertragsverlaengerung - Vertrag laeuft einfach aus.

### Zahlung

- **TA-SPO-10**: Sponsorengeld wird in `_giveSponsorMoney()` nach jedem Spieltag gezahlt.
- **TA-SPO-11**: Zahlung erfolgt nach den Spielen und nach den Gehaltszahlungen.
- **TA-SPO-12**: Atomare Transaktion: Balance-Update und Finance-Log-Eintrag.
- **TA-SPO-13**: WebSocket-Benachrichtigung: `BALANCE_UPDATED` mit Betrag und Grund.

### Datenbank

- **TA-SPO-14**: Tabelle `sponsor`: `id`, `team_id`, `start_season`, `start_game_day`, `duration`, `value`, `name`, `created_at`.
- **TA-SPO-15**: Alte Sponsorenvertraege werden nicht geloescht (Historie bleibt erhalten).

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getSponsor` | Aktiven Sponsor mit verbleibenden Tagen abrufen |
| `getSponsorOffers` | 4 Sponsorenangebote abrufen (gecacht) |
| `chooseSponsor(sponsor)` | Sponsorenvertrag abschliessen |
| `getSponsorNames` | Alle verfuegbaren Sponsornamen |

### Frontend

- **TA-SPO-16**: Aktiver Sponsor als kompakte Karte (gruen) auf der Finanzseite mit Logo, Name, Wert und verbleibenden Tagen.
- **TA-SPO-17**: Angebotskarten im 4er-Grid (responsiv: 1 auf Mobile, 2 auf Tablet, 4 auf Desktop).
- **TA-SPO-18**: Sponsor-Logos als SVG unter `assets/sponsor-images/{name-kebab}.svg`.
- **TA-SPO-19**: "Choose Sponsor"-Sektion nur sichtbar, wenn kein aktiver Sponsor.

### Tests

- Sponsor-Abruf mit aktiven/abgelaufenen Vertraegen
- Caching-Mechanik (24h, Team-spezifisch, Loeschung bei Vertragsabschluss)
- Zahlungslogik (exakt N Spieltage Zahlung)
- Vertraege ueber Saisongrenzen
