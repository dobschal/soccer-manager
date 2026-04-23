# News & Log-Nachrichten

## Beschreibung

Das Nachrichtensystem besteht aus zwei Teilen: **News** (ligaweite Nachrichten, die automatisch nach Spieltagen generiert werden) und **Log-Nachrichten** (teamspezifische Benachrichtigungen ueber Ereignisse).

## User Stories

### News

- **US-NEWS-01**: Als Spieler sehe ich nach jedem Spieltag automatisch generierte Nachrichten ueber die wichtigsten Ereignisse meiner Liga.
- **US-NEWS-02**: Als Spieler kann ich zwischen Spieltagen navigieren, um aeltere Nachrichten zu lesen.
- **US-NEWS-03**: Als Spieler kann ich Nachrichten liken und kommentieren.
- **US-NEWS-04**: Als Spieler kann ich meine gelikten Nachrichten einsehen.

### Log-Nachrichten

- **US-NEWS-05**: Als Spieler erhalte ich Log-Nachrichten ueber alle relevanten Team-Ereignisse (Spielergebnisse, Transfers, Karten, etc.).
- **US-NEWS-06**: Als Spieler sehe ich einen Badge mit der Anzahl neuer Nachrichten im Dashboard-Tab.
- **US-NEWS-07**: Als Spieler kann ich Log-Nachrichten loeschen.
- **US-NEWS-08**: Als Spieler kann ich auf Log-Nachrichten klicken, um zum relevanten Kontext zu navigieren (z.B. Spieler-Modal oeffnen).

## News-Typen (7 Typen)

| Typ | Beschreibung | Ausloeser |
|---|---|---|
| TRANSFER | Teuerster Transfer des Spieltags | Hoechster Transferpreis |
| HIGHEST_WIN | Hoechster Sieg (2+ Tore Differenz) | Groesste Tordifferenz |
| POSITION_FIRST | Tabellenfuehrung uebernommen | Neuer 1. Platz |
| POSITION_LAST | Auf letzten Platz gefallen | Neuer letzter Platz (nur Ligen mit 10+ Teams) |
| STADIUM_EXTENSION | Stadion-Erweiterung abgeschlossen | Bau-Fertigstellung |
| LEVEL_UP | Spieler erreicht Level 4, 7 oder 10 | Level-Meilenstein |
| CUP_MATCH | Pokal-Ergebnis (Halbfinale/Finale oder 2+ Tore Differenz) | Pokal-Spiele |

## Technische Anforderungen

### News-Generierung

- **TA-NEWS-01**: News werden in `generateNewsForGameDay()` nach Abschluss aller Spiele eines Spieltags generiert.
- **TA-NEWS-02**: Jeder News-Typ hat 5 verschiedene Template-Varianten (zufaellig pro Spieltag).
- **TA-NEWS-03**: News werden fuer alle unterstuetzten Sprachen (Locales) gleichzeitig generiert.
- **TA-NEWS-04**: News sind ligaspezifisch (gefiltert nach Level und Liga).

### Datenbank

- **TA-NEWS-05**: Tabelle `news` mit: `id`, `game_day`, `season`, `level`, `league`, `type`, `title`, `text`, `player_id`, `team_id`, `metadata`, `locale`, `created_at`.
- **TA-NEWS-06**: Tabelle `news_like` mit Unique Constraint auf `(user_id, news_id)`.
- **TA-NEWS-07**: Tabelle `news_comment` mit UTF8MB4-Charset und max. 500 Zeichen, Schimpfwort-Filter.

### Log-Nachrichten

- **TA-NEWS-08**: Tabelle `log_message` mit: `id`, `game_day`, `season`, `message`, `team_id`, `action`, `action_value`, `icon`, `created_at`.
- **TA-NEWS-09**: Automatische Bereinigung: Nachrichten aelter als 7 Tage werden geloescht.
- **TA-NEWS-10**: WebSocket-Unterstuetzung fuer Echtzeit-Benachrichtigungen bei neuen Nachrichten.
- **TA-NEWS-11**: `checkTeamAndNotify()` prueft Team-Status und generiert automatisch Warnungen (gesperrte Spieler in Aufstellung, unvollstaendige Aufstellung, niedrige Frische).

### Log-Nachrichten Typen

- Spielergebnisse (Sieg, Niederlage, Unentschieden)
- Pokal-Ergebnisse und Preisgelder
- Gelbe/Rote Karten und Sperren
- Spieler-Status (Karriereende, Level-Up)
- Team-Management (Spieler verpflichtet, entlassen, gekauft, verkauft)
- Transfer-Angebote (erhalten, angenommen, abgelehnt)
- Jugendentwicklung (befoerdert, entlassen, Warnung)
- Gebaeude-Konstruktion (gestartet, abgeschlossen)
- Auf-/Abstiege und Meisterschaften
- Saisonuebergaenge

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getLeagueNews` | News des aktuellen Spieltags fuer die eigene Liga |
| `getNewsForGameDay(gameDay, season, level, league)` | News eines bestimmten Spieltags |
| `toggleNewsLike(newsId)` | Like/Unlike |
| `getNewsComments(newsId)` | Kommentare zu einer News |
| `addNewsComment(newsId, text)` | Kommentar hinzufuegen (max. 500 Zeichen, Schimpfwortfilter) |
| `getLikedNews` | Gelikte Nachrichten (max. 50) |
| `getLogMessages(pageIndex, pageSize)` | Paginierte Log-Nachrichten |
| `getNewLogMessageCount(lastSeenId)` | Anzahl neuer Nachrichten seit ID |
| `deleteLogMessage(messageId)` | Log-Nachricht loeschen |

### Frontend

- **TA-NEWS-12**: News im Dashboard in 2-Spalten-Grid (responsiv: 1 Spalte auf Mobile).
- **TA-NEWS-13**: Spieltag-Navigation (Vor/Zurueck).
- **TA-NEWS-14**: Log-Nachrichten mit Paginierung (10 pro Seite), Farbcodierung (heute: blau, aelter: gedaempft).
- **TA-NEWS-15**: Aktions-Buttons navigieren zu relevantem Kontext (OPEN_PLAYER, OPEN_MY_TEAM_PAGE, etc.).
