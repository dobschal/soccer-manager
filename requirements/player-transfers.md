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
- **US-TRF-09**: Als Spieler sehe ich in der Historie eines Spielers zu jedem Vereinswechsel die gezahlte Ablösesumme.
- **US-TRF-10**: Als Spieler erhalte ich auf ein Kaufangebot an ein Bot-Team keine sofortige Antwort, sondern
  innerhalb von 24 Stunden — bis dahin bleibt das Angebot unter "Meine Angebote" offen, genau wie bei einem
  Angebot an einen menschlichen Manager.
- **US-TRF-11**: Als Spieler kann ich einen Spieler in seiner letzten Saison nicht an ein computergesteuertes
  Team (Bot oder IOC) verkaufen — solche Routiniers nehmen nur menschliche Manager.

## Marktwert-Berechnung

Auf der Marktwerte-Seite werden zwei Quellen kombiniert:

1. **Durchschnitt aus echten Transfers** (in der Tabelle schwarz dargestellt):
   `getTransferStats(position)` liest alle Eintraege aus `trade_history` fuer die gewaehlte Position,
   gruppiert sie nach `level:alter` und bildet den arithmetischen Mittelwert
   (`SUM(price) / COUNT(*)`). Es gibt keine Gewichtung nach Saison/Aktualitaet und keine
   Ausreisser-Bereinigung. Das Alter wird zum Transferzeitpunkt rekonstruiert via
   `trade.season - player.carrier_start_season + 16`. Position-Filter erfolgt auf der **aktuellen**
   Position des Spielers; ein spaeterer Positionswechsel verschiebt den Trade in die neue Spalte.

2. **Schaetzung** (in der Tabelle grau dargestellt), wenn keine Transferdaten vorliegen, via
   `calculateMarketValue(level, age)`:

```
Basis: 40.000.000 Euro (Level 100, Alter 22)
Altersfaktor: x0.75 pro Jahr ueber 22 (Alter <= 22 hat keinen Effekt)
Levelfaktor: x0.9330 pro Level unter 100 (halbiert sich ca. alle 10 Level)
```

Wichtig: Die Schaetzung beruecksichtigt die **Position nicht** — ein Torwart auf Level 50/Alter 22
wird mit denselben 1,25 M Euro geschaetzt wie ein Stuermer.

## Technische Anforderungen

### Angebots-System

- **TA-TRF-01**: Zwei Angebotstypen: `sell` (Verkaufsangebot) und `buy` (Kaufangebot).
- **TA-TRF-02**: Maximal 3 Kaufangebote pro Spieler pro Spieltag (Spam-Schutz).
- **TA-TRF-03**: Kaufangebote an Bot-Teams werden automatisch bewertet und angenommen/abgelehnt — jedoch
  nicht im Request, sondern verzoegert (TA-TRF-28).
- **TA-TRF-04**: Bei Annahme: Spieler wechselt das Team, Balance wird aktualisiert, Aufstellungs-Position wird geloescht.
- **TA-TRF-05**: Alle anderen Angebote fuer den transferierten Spieler werden geloescht.
- **TA-TRF-22**: Preisuntergrenze: Weder ein Verkaufsangebot (`sell`) noch ein Kaufangebot (`buy`) darf unter
  75 % des Marktwerts des Spielers liegen (`getMinOfferPrice`, `MIN_OFFER_MARKET_VALUE_RATIO = 0.75` in
  `client/util/player.js`). Der Marktwert kommt serverseitig aus `getAveragePlanPriceOfPlayer` auf Basis des
  **in der Datenbank gespeicherten** Spielers, nicht aus den Client-Daten. Die UI prueft zusaetzlich vorab,
  die verbindliche Pruefung erfolgt in `addTradeOffer`.

### Bot-Transfer-Bewertung

- **TA-TRF-06**: Phase 1: Direkter Abgleich mit bestehendem Verkaufsangebot. Wer den geforderten Preis
  erreicht, bekommt den Spieler — der eigene Angebotspreis eines Bots ist bindend.
- **TA-TRF-07**: Phase 2: Formations-Analyse (wuerde der Verkauf eine Luecke hinterlassen?).
- **TA-TRF-08**: Luecke vorhanden: 1.5-2x Preisaufschlag, einziger Spieler auf Position = Ablehnung.
- **TA-TRF-09**: Keine Luecke: 0.8-1.2x Basispreis mit Zufallsfaktor.
- **TA-TRF-28**: Antwort-Verzoegerung: Beim Anlegen eines Kaufangebots fuer einen Bot-Spieler wird auf
  `trade_offer.bot_decision_at` ein Zeitpunkt zwischen 15 Minuten und 24 Stunden in der Zukunft gespeichert
  (`botDecisionDate`, quadratisch verteilt — die meisten Antworten kommen in den ersten Stunden). Ein CRON-Lauf
  im 5-Minuten-Takt (`processDueBotOfferDecisions`) beantwortet alle faelligen Angebote nach TA-TRF-06 bis
  TA-TRF-09. Der Spieltags-CRON (`makeBotMoves`) fasst nur Angebote an, die faellig sind oder gar keinen
  Termin haben (Altbestand). Gruende: Eine sofortige Antwort liess die randomisierte Annahmeschwelle mit einer
  Serie von Angeboten austesten und der Markt wirkte wie ein Automat.
- **TA-TRF-29**: Kein computergesteuertes Team kauft einen Spieler in seiner letzten Saison
  (`willRetireNextSeason`). Das gilt fuer die Bot-Kaufsuche (gelistete Angebote und unaufgeforderte
  Angebote), fuer die IOC-Kaeufe (TA-TRF-30) und als harte Absicherung in `acceptOffer`, sodass auch ein
  altes, noch offenes Bot-Angebot nach dem Saisonwechsel nicht mehr angenommen werden kann. Grund: Nutzer
  verkauften Routiniers genau in der Saison, in der sie in Rente gehen, und liessen den Bot den vollen
  Marktwert fuer einen Kader-Platzhalter zahlen. Menschliche Kaeufer duerfen das Risiko eingehen — sie sehen
  den Rentenhinweis (siehe [Player Retirement](player-retirement.md)).

### Freie Spieler

- **TA-TRF-10**: Freie Spieler (team_id = NULL) sind kostenlos verpflichtbar.
- **TA-TRF-11**: Freie Spieler sind relativ schwach (Level 10-20, Alter 28-32).
- **TA-TRF-12**: Markt wird auf Teamanzahl-Groesse gehalten.

### International Oversea Club (IOC)

- **TA-TRF-13**: System-Team (`is_system_team = 1`), das als "Spieler-Senke" dient.
- **TA-TRF-14**: Bei Transfer zum IOC wird der Spieler komplett geloescht.
- **TA-TRF-23**: `fillMarketGaps` haelt pro Position und Stufe eine Mindestzahl offener Verkaufsangebote
  vor (bronze Level 1-40: 8, silber 41-70: 10, gold 71-100: 2) und erzeugt dafuer neue Spieler
  (Alter 20-28).
- **TA-TRF-24**: Alle IOC-Preise — neu erzeugte Verkaufsangebote wie auch Kaufangebote an Nutzer — liegen
  auf dem Marktwert mit **+-3 %** Zufallsabweichung (`IOC_PRICE_DEVIATION`), mindestens 1.000 EUR.
- **TA-TRF-25**: `repriceIOCOffers` zieht offene IOC-Verkaufsangebote bei jedem CRON-Lauf auf den
  **aktuellen** Marktwert nach. Ohne das bleibt der bei der Erzeugung eingefrorene Preis stehen, waehrend
  der Spieler weiter altert (−15 % Marktwert pro Jahr ueber 22) — ein mehrere Saisons altes Angebot
  verlangt sonst ein Vielfaches dessen, was das Spielerprofil als Wert ausweist.
- **TA-TRF-26**: Nachgezogen wird nur, wenn der Preis um mehr als `IOC_REPRICE_TOLERANCE` (5 %) vom
  Marktwert abweicht. Die Toleranz liegt ueber der Preisabweichung aus TA-TRF-24, damit ein frisch
  gesetzter Preis nicht sofort wieder korrigiert wird und die Preise nicht bei jedem Lauf zittern.
- **TA-TRF-27**: Angebote von Nutzer- und Bot-Teams werden nie nachgezogen — deren Preis ist eine
  bewusste Entscheidung.
- **TA-TRF-30**: Der IOC antwortet auf Kaufangebote weiter sofort (er ist Market Maker, kein Manager), kauft
  aber ebenfalls keine Spieler in ihrer letzten Saison — sonst wandert der Trick aus TA-TRF-29 nur von den
  Bots zum IOC.

### Datenbank

- **TA-TRF-15**: Tabelle `trade_offer`: `id`, `offer_value`, `type`, `player_id`, `from_team_id`, `game_day`, `season`, `status`, `allow_instant_buy`, `bot_decision_at`, `created_at`.
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
| `getPlayerHistory(playerId)` | Historie eines Spielers; `TRANSFER`-Eintraege liefern zusaetzlich `price` (Join aus `trade_history` ueber Saison, Spieltag und Zielverein) |

### Frontend

- **TA-TRF-18**: Trades-Seite mit 6 Tabs: Transfermarkt, Eingehende Angebote, Meine Angebote, Transfer-Historie, Freie Spieler, Marktwerte.
- **TA-TRF-19**: Transfermarkt mit Filtern (Position, Alter 16-40, Level 1-100) und Paginierung (20/Seite).
- **TA-TRF-20**: Marktwerte-Matrix unterscheidet Zellen mit echten Transferdaten (schwarze Schrift, Durchschnitt aus `trade_history`) und Zellen ohne Daten (graue Schrift, `calculateMarketValue`-Schaetzung).
- **TA-TRF-21**: WebSocket-Events: `BUY_OFFER_ACCEPTED`, `BUY_OFFER_REJECTED` fuer Echtzeit-Updates.
- **TA-TRF-22**: Die Spieler-Historie im Spieler-Dialog zeigt bei Vereinswechseln die Ablösesumme
  (`player.historyTransferWithPrice`). Fehlt der Preis (kein passender `trade_history`-Eintrag mehr),
  faellt die Anzeige auf `player.historyTransfer` ohne Betrag zurueck.

### Tests

- Angebotsvalidierung (Preis, Balance, Duplikate, Limit)
- Bot-Bewertungslogik (Formations-Analyse, Preisberechnung)
- IOC-Preisnachfuehrung: veraltetes Angebot wird gesenkt, zu niedriges angehoben, Angebote innerhalb der
  Toleranz bleiben unangetastet, nur IOC-eigene Angebote werden angefasst
- Transfer-Durchfuehrung (Spieler-Zuweisung, Balance-Updates, Bereinigung)
- Marktwert-Formel
