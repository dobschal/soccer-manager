# Fair Play (Regeln & Betrugserkennung)

## Beschreibung

Das Spiel erkennt seit jeher verdaechtige Muster (Mehrfach-Accounts, abgesprochene Transfers), die Regeln dazu waren
aber nirgends fuer Spieler dokumentiert. Dieses Dokument haelt fest, welche Regeln gelten, wo sie den Spielern
kommuniziert werden und wie sie technisch durchgesetzt bzw. erkannt werden.

## User Stories

- **US-FAIR-01**: Als Spieler kann ich im Wiki nachlesen, welche Regeln fuer Accounts und Transfers gelten
  (Wiki-Topic `fair-play`, en + de).
- **US-FAIR-02**: Als Spieler werde ich beim Anlegen eines zu niedrigen Angebots direkt abgewiesen, statt erst
  nachtraeglich sanktioniert zu werden.
- **US-FAIR-03**: Als Admin sehe ich verdaechtige Aktivitaeten gebuendelt in der Nutzerverwaltung und entscheide
  manuell ueber Konsequenzen.

## Regeln (Spielersicht)

- **Ein Account pro Person.** Zweit-Accounts, Account-Sharing und die Uebernahme fremder Vereine sind verboten.
  Mehrere Personen im selben Haushalt/Netzwerk mit je eigenem Verein sind ausdruecklich erlaubt.
- **Keine abgesprochenen Transfers.** Preise muessen dem Spielerwert entsprechen; Geld darf nicht ueber
  Unter-/Ueberwert-Transfers zwischen Vereinen verschoben werden.
- **Konsequenz.** Bestaetigtes Cheating kann zur Loeschung des Accounts durch einen Admin fuehren
  (`deleteUser` in der Admin-Nutzerverwaltung). Eine automatische Sanktion gibt es bewusst nicht.

## Technische Anforderungen

### Praevention

- **TA-FAIR-01**: Preisuntergrenze von 75 % des Marktwerts fuer `sell`- **und** `buy`-Angebote, serverseitig in
  `addTradeOffer` erzwungen (siehe `requirements/player-transfers.md`, TA-TRF-22).
- **TA-FAIR-02**: Maximal `MAX_TRANSFERS_PER_SEASON` Vereinswechsel pro Spieler und Saison.
- **TA-FAIR-03**: Frisch vom freien Markt verpflichtete Spieler koennen in derselben Saison nicht weiterverkauft
  werden (kein Gratis-Spieler-Flip).

### Erkennung (`server/helper/fraudHelper.js`)

- **TA-FAIR-04**: `shared_ip` — Accountpaare mit derselben zuletzt genutzten IP (Web/iOS/Android),
  Zeitfenster `SHARED_IP_LOOKBACK_DAYS`.
- **TA-FAIR-05**: `shared_device` — Accountpaare mit derselben Geraete-UUID (`user_device`). Staerkeres Signal als
  die IP, da pro Browser-Profil/Installation eindeutig.
- **TA-FAIR-06**: `frequent_trades` — Vereinspaare mit >= `FREQUENT_TRADES_THRESHOLD` Transfers untereinander
  innerhalb von `FREQUENT_TRADES_WINDOW_DAYS` Tagen (richtungsunabhaengig, nur Nutzer-Teams).
- **TA-FAIR-07**: `undervalued_trade` / `overvalued_trade` — Transferpreis unter `UNDERVALUED_RATIO` bzw. ueber
  `OVERVALUED_RATIO` des geschaetzten Marktwerts, ab `PRICE_DEVIATION_MIN_VALUE`.
- **TA-FAIR-08**: Alle Detektoren laufen parallel, werden nach Zeit absteigend sortiert und paginiert an die
  Admin-Ansicht geliefert (`getSuspiciousActions`).

### Bewertung

- **TA-FAIR-09**: Eine Markierung ist kein Urteil — jede Auffaelligkeit wird manuell geprueft. Insbesondere
  `shared_ip` erzeugt legitime Treffer (Haushalt, Firmennetz, CGNAT).
