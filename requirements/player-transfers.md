# Spieler-Transfers (Player Transfers)

## Beschreibung

Das Transfersystem ermoeglicht den Kauf und Verkauf von Spielern zwischen Teams ueber einen Marktplatz. Teams koennen Spieler zum Verkauf anbieten, Kaufangebote abgeben und freie Spieler verpflichten.

## User Stories

- **US-TRF-01**: Als Spieler kann ich den Transfermarkt durchsuchen und nach Position, Alter und Level filtern.
- **US-TRF-02**: Als Spieler kann ich eigene Spieler zum Verkauf anbieten mit einem Wunschpreis.
- **US-TRF-03**: Als Spieler kann ich Kaufangebote fuer Spieler anderer Teams abgeben.
- **US-TRF-04**: Als Spieler sehe ich eingehende Kaufangebote und kann diese annehmen oder ablehnen.
- **US-TRF-05**: Als Spieler sehe ich den Status meiner abgegebenen Angebote (offen, angenommen, abgelehnt).
- **US-TRF-06**: Als Spieler kann ich freie Spieler (ohne Team) kostenlos verpflichten.
- **US-TRF-07**: Als Spieler kann ich die Transfer-Historie aller Transfers einsehen.
- **US-TRF-08**: Als Spieler kann ich Marktwerte analysieren (Matrix aus Level vs. Alter mit Durchschnittspreisen).

## Marktwert-Berechnung

```
calculateMarketValue(level, age)
  Basis: 40.000.000 Euro (Level 100, Alter 22)
  Altersfaktor: x0.75 pro Jahr ueber 22
  Levelfaktor: x0.9330 pro Level unter 100 (halbiert sich ca. alle 10 Level)
```

## Technische Anforderungen

### Angebots-System

- **TA-TRF-01**: Zwei Angebotstypen: `sell` (Verkaufsangebot) und `buy` (Kaufangebot).
- **TA-TRF-02**: Maximal 3 Kaufangebote pro Spieler pro Spieltag (Spam-Schutz).
- **TA-TRF-03**: Kaufangebote an Bot-Teams werden automatisch bewertet und angenommen/abgelehnt.
- **TA-TRF-04**: Bei Annahme: Spieler wechselt das Team, Balance wird aktualisiert, Aufstellungs-Position wird geloescht.
- **TA-TRF-05**: Alle anderen Angebote fuer den transferierten Spieler werden geloescht.

### Bot-Transfer-Bewertung

- **TA-TRF-06**: Phase 1: Direkter Abgleich mit bestehendem Verkaufsangebot.
- **TA-TRF-07**: Phase 2: Formations-Analyse (wuerde der Verkauf eine Luecke hinterlassen?).
- **TA-TRF-08**: Luecke vorhanden: 1.5-2x Preisaufschlag, einziger Spieler auf Position = Ablehnung.
- **TA-TRF-09**: Keine Luecke: 0.8-1.2x Basispreis mit Zufallsfaktor.

### Freie Spieler

- **TA-TRF-10**: Freie Spieler (team_id = NULL) sind kostenlos verpflichtbar.
- **TA-TRF-11**: Freie Spieler sind relativ schwach (Level 10-20, Alter 28-32).
- **TA-TRF-12**: Markt wird auf Teamanzahl-Groesse gehalten.

### International Oversea Club (IOC)

- **TA-TRF-13**: System-Team (`is_system_team = 1`), das als "Spieler-Senke" dient.
- **TA-TRF-14**: Bei Transfer zum IOC wird der Spieler komplett geloescht.

### Datenbank

- **TA-TRF-15**: Tabelle `trade_offer`: `id`, `offer_value`, `type`, `player_id`, `from_team_id`, `game_day`, `season`, `status`, `created_at`.
- **TA-TRF-16**: Tabelle `trade_history`: `id`, `game_day`, `season`, `player_id`, `from_team_id`, `to_team_id`, `price`, `player_level`, `created_at`.
- **TA-TRF-17**: Status-Werte: `open`, `accepted`, `rejected`, `dismissed`.

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getOffers` | Alle offenen Verkaufsangebote |
| `addTradeOffer(player, price, type)` | Kauf-/Verkaufsangebot erstellen |
| `acceptOffer(offer)` | Eingehendes Kaufangebot annehmen |
| `declineOffer(offer)` | Eingehendes Kaufangebot ablehnen |
| `cancelOffer(offer)` | Eigenes Angebot zurueckziehen |
| `getAnsweredOffers` | Angenommene/abgelehnte Angebote |
| `getTransferStats(position)` | Marktwert-Statistiken nach Position |
| `getTradeHistory` | Transfer-Historie |

### Frontend

- **TA-TRF-18**: Trades-Seite mit 6 Tabs: Transfermarkt, Eingehende Angebote, Meine Angebote, Transfer-Historie, Freie Spieler, Marktwerte.
- **TA-TRF-19**: Transfermarkt mit Filtern (Position, Alter 16-40, Level 1-100) und Paginierung (20/Seite).
- **TA-TRF-20**: Marktwerte-Matrix mit Farbcodierung: Gruen = unterbewertet (<80%), Gelb = fair (80-120%), Rot = ueberbewertet (>120%).
- **TA-TRF-21**: WebSocket-Events: `BUY_OFFER_ACCEPTED`, `BUY_OFFER_REJECTED` fuer Echtzeit-Updates.

### Tests

- Angebotsvalidierung (Preis, Balance, Duplikate, Limit)
- Bot-Bewertungslogik (Formations-Analyse, Preisberechnung)
- Transfer-Durchfuehrung (Spieler-Zuweisung, Balance-Updates, Bereinigung)
- Marktwert-Formel
