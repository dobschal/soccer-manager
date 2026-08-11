# Nutzer-Texteingaben

## Beschreibung

Querschnittsregeln fuer alle Felder, in die Spieler freien Text eintragen: Aufstellungsnamen, Teamname und
Kurzname, Stadionname, Benutzername, Chat-Nachrichten, Forum-Beitraege und -Kommentare, Kommentare im
Kartenmarkt, Meldegruende und Jugendspieler-Namen aus Aktionskarten.

Kernregel: **Der komplette Unicode-Zeichensatz ist erlaubt, insbesondere Emojis.** Frueher wurde
`😳` in einem Aufstellungsnamen mit `ER_TRUNCATED_WRONG_VALUE_FOR_FIELD` abgelehnt, weil die betroffenen
Tabellen noch auf dem alten MySQL-Zeichensatz `utf8` (= `utf8mb3`) lagen. `utf8mb3` speichert maximal drei
Byte pro Zeichen und kann damit nichts ausserhalb der Basic Multilingual Plane ablegen — und dort liegt
jedes Emoji.

## User Stories

- **US-UI-01**: Als Spieler kann ich in jedem Freitextfeld Emojis und Sonderzeichen aller Sprachen verwenden,
  ohne eine Fehlermeldung zu bekommen.
- **US-UI-02**: Als Spieler sehe ich meinen Text spaeter genau so wieder, wie ich ihn eingegeben habe — kein
  Emoji wird zu einem Fragezeichen oder Platzhalter-Kaestchen.
- **US-UI-03**: Als Spieler zaehlt ein Emoji gegen ein Zeichenlimit genau wie jedes andere Zeichen, also als
  eins und nicht als zwei.

## Technische Anforderungen

### Zeichensatz der Datenbank

- **TA-UI-01**: Die Datenbank selbst und alle neu angelegten Tabellen laufen auf `utf8mb4`. Die
  Verbindung im Pool (`server/lib/database.js`) ist ebenfalls auf `utf8mb4` gesetzt.
- **TA-UI-02**: `convertLegacyTablesToUtf8mb4()` in `server/migrate-database.js` sucht ueber
  `information_schema.TABLES` alle Basistabellen des aktuellen Schemas mit einer `utf8mb3%`-Kollation und
  fuehrt fuer jede ein `ALTER TABLE … CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` aus.
- **TA-UI-03**: Diese Konvertierung laeuft am **Ende jedes** `runMigration()`-Durchlaufs, nicht als einmaliger
  Migrationseintrag. Damit kann eine spaeter hinzugefuegte Tabelle mit `DEFAULT CHARSET=utf8` das Problem nicht
  erneut einschleppen. Ist nichts mehr zu konvertieren, kostet der Schritt eine einzige Abfrage pro Start.
- **TA-UI-04**: Die Konvertierung ist idempotent und wiederaufsetzbar — bereits konvertierte Tabellen fallen
  aus der Abfrage heraus, ein abgebrochener Lauf macht beim naechsten Start dort weiter, wo er aufgehoert hat.
- **TA-UI-05**: Tabellen werden aufsteigend nach Groesse konvertiert, damit die kleinen, nutzernahen Tabellen
  zuerst fertig sind. `ALTER TABLE … CONVERT` ist ein Rebuild, der die Tabelle waehrenddessen sperrt — der
  erste Lauf auf Prod dauert deshalb einmalig einige Minuten (grosse `game`-Tabelle).

### Zeichen zaehlen und kuerzen

- **TA-UI-06**: `truncateChars(value, max)` und `charLength(value)` in `server/lib/util.js` zaehlen
  Unicode-Codepoints statt UTF-16-Codeunits — genau so, wie MySQL die Laenge eines `VARCHAR(n)` zaehlt.
- **TA-UI-07**: Nutzertext darf **nie** mit `String.prototype.slice` gekuerzt werden. `slice` schneidet nach
  Codeunits und kann damit ein Surrogate-Paar zerteilen; der uebrig bleibende halbe Codepoint ist kein
  gueltiges UTF-8 und landet als `U+FFFD` (`�`) in der Datenbank. Stattdessen `truncateChars` verwenden.
- **TA-UI-08**: Laengenpruefungen, die Text ablehnen statt kuerzen, nutzen `charLength` — sonst zaehlt ein
  Emoji doppelt und das Limit ist strenger als dokumentiert.
- **TA-UI-09**: Betroffene Aufrufstellen: `sanitizeLineupName` (`teamLineupHelper.js`),
  `updateTeamName` (`routes/team.js`), `updateStadiumName` (`routes/stadium.js`),
  `createCardOffer`/`placeCardBid` (`actionCardMarketHelper.js`), `_validateYouthPlayerOption`
  (`actionCardHelper.js`), `reportUser` (`routes/userProfile.js`), `sendMessage` (`routes/chat.js`),
  Wiki-Titel und -Untertitel (`routes/wiki.js`).
- **TA-UI-10**: Das Forum lehnt zu langen Text ab, statt ihn zu kuerzen, und ist damit von TA-UI-07 nicht
  betroffen.

### Tests

- `truncateChars`: kuerzt auf Codepoints, zaehlt Emojis als eins, laesst nie ein halbes Emoji zurueck,
  liefert `''` fuer Nicht-Strings
- `charLength`: zaehlt Codepoints, nicht UTF-16-Codeunits
- `convertLegacyTablesToUtf8mb4`: konvertiert jede gefundene `utf8mb3`-Tabelle, macht nichts bei leerem
  Ergebnis, filtert auf Basistabellen des aktuellen Schemas
- `renameLineup`: 40 Emojis passen ins Limit, laengere Namen werden ohne zerschnittenes Surrogate-Paar gekuerzt
