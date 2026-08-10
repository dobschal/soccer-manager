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
- **US-FAIR-04**: Als Admin kann ich eine E-Mail-Adresse sperren. Damit ist weder Registrierung noch Login moeglich,
  und ein bestehender Login wird sofort ungueltig — als mildere Konsequenz als das Loeschen des Accounts.
- **US-FAIR-05**: Als gesperrter Spieler bekomme ich beim Login-Versuch eine klare Meldung mit Verweis auf den
  Support statt eines generischen Fehlers.
- **US-FAIR-06**: Als Admin werde ich per E-Mail informiert, sobald ein Spieler einen anderen meldet, und muss
  dafuer nicht regelmaessig in den Adminbereich schauen.
- **US-FAIR-07**: Als Admin kann ich die Liste der auffaelligen Aktivitaeten nach Typ filtern und nach Nutzer-
  oder Vereinsnamen durchsuchen, um einen konkreten Verdacht gezielt zu pruefen.

## Regeln (Spielersicht)

- **Ein Account pro Person.** Zweit-Accounts, Account-Sharing und die Uebernahme fremder Vereine sind verboten.
  Mehrere Personen im selben Haushalt/Netzwerk mit je eigenem Verein sind ausdruecklich erlaubt.
- **Keine abgesprochenen Transfers.** Preise muessen dem Spielerwert entsprechen; Geld darf nicht ueber
  Unter-/Ueberwert-Transfers zwischen Vereinen verschoben werden.
- **Konsequenz.** Bestaetigtes Cheating kann zur Sperre der E-Mail-Adresse oder zur Loeschung des Accounts durch
  einen Admin fuehren. Eine automatische Sanktion gibt es bewusst nicht — beides ist eine manuelle Entscheidung.

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
- **TA-FAIR-15**: `getSuspiciousActions` akzeptiert zusaetzlich `type` (einer aus `SUSPICIOUS_ACTION_TYPES`) und
  `search` (Freitext, max. 100 Zeichen, matcht Nutzername oder Vereinsname beider Beteiligten,
  case-insensitiv). Gefiltert wird **vor** der Paginierung, `total` meldet daher die gefilterte Menge.
  Ein unbekannter `type` wird verworfen statt alles wegzufiltern.
- **TA-FAIR-16**: Die Filter-Bedienelemente liegen ausserhalb des neu gerenderten Ergebnis-Containers, damit die
  Suche beim Tippen Fokus und Cursor behaelt. Nur `#_suspiciousResultsId` wird per `innerHTML` getauscht; die
  Pagination-Buttons darin haengen deshalb an einem delegierten Click-Handler auf dem Container.
- **TA-FAIR-10**: `shared_push_token` — Accountpaare mit demselben Push-Token (`device_token`). Haerteres Signal als
  `shared_device`, da der Token pro App-Installation vergeben wird und das Leeren des Browser-Speichers ueberlebt.
- **TA-FAIR-11**: `self_invite_link` / `self_referral` — eingeloeste Einladungen, bei denen Einladender und
  Eingeladener dieselbe Person sind: bei `link_invite` matcht die `invitee_ip` eine der eigenen IPs des Einladenden,
  bei `referral_invitation` teilen sich beide Accounts IP oder Geraete-UUID.
- **TA-FAIR-12**: `instant_card_pickup` — Action-Card-Auktionen, die vom selben Team im Schnitt binnen
  `INSTANT_PICKUP_MAX_SECONDS` nach dem Einstellen gewonnen werden, mindestens `INSTANT_PICKUP_MIN_COUNT` mal.
  Echte Auktionen laufen Stunden; Sekundenwerte bedeuten Absprache ausserhalb des Spiels.

### Sperre (`server/helper/emailBlockHelper.js`)

- **TA-FAIR-13**: Gesperrte Adressen liegen in `blocked_email` (unique, normalisiert auf trim + lowercase).
  `createAccount`, `login` und `setEmail` weisen sie ab; `requestPasswordReset` antwortet still mit Erfolg.
  Geprueft werden `user.email` **und** `user.pending_email`, damit ein Adresswechsel die Sperre nicht aushebelt.
- **TA-FAIR-14**: JWTs sind zustandslos — das Widerrufen laeuft ueber `user.sessions_invalid_before`. Die
  Auth-Middleware verwirft jedes Token, dessen `iat` vor diesem Zeitpunkt liegt. Der Cutoff wird auf die naechste
  volle Sekunde gesetzt, da `iat` nur Sekundenaufloesung hat. Sperren ruft das automatisch fuer alle betroffenen
  Accounts auf, `invalidateUserLogin` erlaubt es auch einzeln ohne Sperre.

### Nutzermeldungen (#489)

- **TA-FAIR-17**: `reportUser` speichert die Meldung weiterhin in `user_report` und verschickt zusaetzlich eine
  E-Mail an `config.ADMIN_EMAIL` (`sendUserReportEmail` in `server/lib/email.js`) mit Zeitpunkt, gemeldetem
  Nutzer, Melder und Begruendung.
- **TA-FAIR-18**: Die Adresse kommt aus der Umgebungsvariable `ADMIN_EMAIL` (Default `info@footballmanager.io`)
  und ist in beiden `.env`-Heredocs in `.github/workflows/ci.yml` gesetzt.
- **TA-FAIR-19**: Der Mailversand ist bewusst best-effort: schlaegt er fehl, wird geloggt, die Meldung selbst
  aber trotzdem gespeichert und als Erfolg quittiert.

### Bewertung

- **TA-FAIR-09**: Eine Markierung ist kein Urteil — jede Auffaelligkeit wird manuell geprueft. Insbesondere
  `shared_ip` erzeugt legitime Treffer (Haushalt, Firmennetz, CGNAT). `shared_push_token` und `instant_card_pickup`
  sind die trennschaerfsten Signale, `shared_ip` das schwaechste.
