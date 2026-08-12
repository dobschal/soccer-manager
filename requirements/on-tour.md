# On Tour

## Beschreibung

Ein Verein kann Spieler auf Werbereise schicken. Die Spieler fehlen waehrend der Reise im
Spielbetrieb, fuellen dafuer aber jeden Spieltag einen Fortschrittsbalken. Ist der Balken voll,
gibt es die Aktionskarten des gewaehlten Reiseziels. Damit wird Kadertiefe in Karten umgemuenzt —
wer nur elf Spieler hat, kann nicht mitmachen.

## User Stories

- **US-TOUR-01**: Als Spieler waehle ich auf einem eigenen Tab meiner Mannschaftsseite ("On Tour",
  direkt hinter "Aktionen") zwischen drei Reisezielen.
- **US-TOUR-02**: Als Spieler entsende ich Spieler fuer eine selbst gewaehlte Dauer von 3 bis 7
  Spieltagen.
- **US-TOUR-03**: Als Spieler sehe ich einen Fortschrittsbalken, der sich pro Spieltag und
  entsendetem Spieler fuellt.
- **US-TOUR-04**: Als Spieler erhalte ich die Karten des Reiseziels, sobald der Balken voll ist.
- **US-TOUR-05**: Als Spieler kann ich das Reiseziel jederzeit wechseln, werde aber **immer** vorher
  gefragt — bei vorhandenem Fortschritt inklusive der Punktzahl, die dabei verloren geht.
- **US-TOUR-06**: Als Spieler erkenne ich entsendete Spieler in der Kaderliste an einem
  Flugzeug-Symbol und kann sie nicht aufstellen.
- **US-TOUR-07**: Als Spieler sehe ich vor dem Entsenden, wie viel Fortschritt ein Spieler pro
  Spieltag beitragen wuerde.
- **US-TOUR-08**: Als Spieler kann ich einen gerade erst entsendeten Spieler wieder zurueckholen,
  solange noch kein Spieltag vergangen ist — danach ist die Reise bindend.
- **US-TOUR-09**: Als Spieler sehe ich den Zugewinn des naechsten Spieltags als schraffierte
  Vorschau im Fortschrittsbalken, statt ihn als Zahl vorgerechnet zu bekommen.

## Reiseziele und Belohnungen

| Reiseziel | Belohnung |
|---|---|
| Suedamerika | 1× Nachwuchsstar (`NEW_YOUTH_PLAYER_3`) |
| Asien | 1× Millionengeschenk (`MILLION_BONUS`) |
| Europa | 5× Meister-Training (`LEVEL_UP_PLAYER_100`) |

Suedamerika zahlte urspruenglich zwei Nachwuchsstars aus. Zusammen mit Spieltagen, Jugendakademie und
Login-Bonus kamen dadurch zu viele Nachwuchskarten ins Spiel — die Reise bringt jetzt genau einen.

## Regeln

| Regel | Wert |
|---|---|
| Gleichzeitig entsendete Spieler | max. 3 (`MAX_PLAYERS_ON_TOUR`) |
| Dauer je Entsendung | 3-7 Spieltage (`TOUR_MIN_DAYS` / `TOUR_MAX_DAYS`) |
| Fortschritt fuer eine Belohnung | 30 Punkte (`TOUR_PROGRESS_TARGET`) |
| Fortschritt je Spieler und Spieltag | `Spielerlevel / Kader-Durchschnittslevel` |

Drei durchschnittliche Spieler ueber die vollen sieben Spieltage ergeben 21 Punkte — eine Belohnung
braucht also etwas mehr als eine komplette Entsendung.

## Technische Anforderungen

### Datenmodell

- **TA-TOUR-01**: `team_tour` (`team_id` PK, `mode`, `progress`, `updated_at`) haelt Reiseziel und
  Fortschritt je Verein. Die Zeile wird beim ersten Zugriff angelegt, damit die Seite immer etwas
  rendern kann.
- **TA-TOUR-02**: `player.tour_days_left` zaehlt die verbleibenden Spieltage. `> 0` heisst
  "unterwegs" und ist damit ein dritter Nichtverfuegbarkeits-Zustand neben verletzt und gesperrt.
- **TA-TOUR-15**: `player.tour_days_total` haelt die gebuchte Dauer. Solange
  `tour_days_left === tour_days_total` ist noch kein Spieltag vergangen, es wurde also nichts
  verdient — genau dieses Fenster erlaubt das Zurueckholen. Beim Ende der Reise wird die Spalte
  wieder auf 0 gesetzt. Spieler, die zum Zeitpunkt der Migration schon unterwegs waren, werden per
  Backfill auf `tour_days_total = tour_days_left` gesetzt — ohne das haetten sie dauerhaft keinen
  Zurueckholen-Button. Der Preis ist eine einmalige Gratis-Stornierung beim Rollout.

### Fortschritt (`server/helper/tourHelper.js`)

- **TA-TOUR-03**: `tourProgressPerGameDay(level, kaderDurchschnitt)` bemisst den Beitrag **relativ
  zum eigenen Kader**. Ein durchschnittlicher Spieler bringt genau 1,0, der beste rund 1,2. Dadurch
  fuellt ein Viertligist den Balken genauso schnell wie ein Erstligist — die Reise ist keine
  Belohnung fuer bereits starke Vereine.
- **TA-TOUR-04**: `advanceTours()` laeuft einmal pro Spieltag im CRON, **nach** der Spielberechnung:
  Fortschritt gutschreiben, Reisetage herunterzaehlen, bei vollem Balken auszahlen.
- **TA-TOUR-05**: Ueberschuss ueber die 30 Punkte wird in die naechste Reise uebernommen, statt
  verworfen zu werden.
- **TA-TOUR-06**: Ein Fehler bei einem Verein bricht den Durchlauf nicht ab — die uebrigen Vereine
  werden trotzdem abgearbeitet.
- **TA-TOUR-07**: Karten, deren Stapel beim Team voll ist, werden uebersprungen (`canReceiveActionCard`),
  sonst haengen sie unabholbar auf `pending`.

### Nichtverfuegbarkeit

- **TA-TOUR-08**: Beim Entsenden werden `in_game_position` und `bench_position` sofort geleert —
  sonst wuerde die Aufstellung einen Spieler aufbieten, der nicht da ist.
- **TA-TOUR-09**: `tour_days_left > 0` schliesst einen Spieler ueberall aus, wo bisher schon
  `is_injured` / `is_suspended` geprueft wurden: Spielberechnung, Bank-Einwechslung, Auto-Fill der
  Aufstellung, Bot-Aufstellung, Spieler- und Bank-Auswahl im Client.
- **TA-TOUR-10**: Verletzte und gesperrte Spieler koennen nicht entsendet werden — sonst liesse sich
  eine Sperre durch eine Reise "absitzen".
- **TA-TOUR-16**: `recallPlayersFromTour(teamId, playerIds)` bricht eine noch nicht begonnene Reise
  ab und setzt `tour_days_left` und `tour_days_total` auf 0. Nach dem ersten Spieltag wird die
  Anfrage abgelehnt — sonst koennte man den Fortschritt einstreichen und den Spieler trotzdem
  aufstellen. Die Aufstellungsplaetze bleiben leer und muessen neu gesetzt werden.

### API (`server/routes/tour.js`)

| Endpunkt | Zweck |
|---|---|
| `getMyTour()` | Reiseziel, Fortschritt, freie Plaetze, Kader mit Beitrag je Spieler, alle Reiseziele mit Belohnung |
| `setMyTourMode(mode)` | Reiseziel wechseln (verwirft den Fortschritt) |
| `sendPlayersOnTour(playerIds, days)` | Spieler fuer `days` Spieltage entsenden |
| `recallPlayersFromTour(playerIds)` | Noch nicht begonnene Reise abbrechen |

### Frontend

- **TA-TOUR-11**: Eigene Unterseite der My-Team-Seite (`#my-team?sub_page=tour`,
  `client/pages/my-team/tour.js`), als Tab hinter "Aktionen". Da die My-Team-Seite in beiden
  Entry-Points registriert ist, ist keine separate Registrierung in `native-app.js` noetig.
- **TA-TOUR-12**: Die drei Reiseziel-Karten nutzen die Illustrationen aus dem Ticket
  (`client/assets/tour/*.jpg`).
- **TA-TOUR-13**: Im Entsende-Overlay werden weitere Checkboxen deaktiviert, sobald die freien
  Plaetze belegt sind — der Server wuerde es ohnehin ablehnen, aber stilles Deaktivieren ist
  freundlicher als eine Fehlermeldung.
- **TA-TOUR-14**: Ein Wechsel des Reiseziels fragt immer nach. Bei Fortschritt > 0 nennt der Dialog
  die Punkte, die verworfen werden (`tour.switchWarning`), sonst weist er darauf hin, dass alle
  Reisenden ab sofort fuer das neue Ziel sammeln (`tour.switchQuestion`). Auch bei 0 Punkten ist der
  Wechsel folgenreich genug, um ihn nicht versehentlich auszuloesen.
- **TA-TOUR-17**: Der Fortschrittsbalken zeigt hinter dem gefuellten Bereich eine schraffierte
  Vorschau (`.tour-progress__preview`) in Hoehe des Zugewinns am naechsten Spieltag, gedeckelt am
  Balkenende. Die frueher darunter stehende Zeile "+X Punkte pro Spieltag" entfaellt.
- **TA-TOUR-18**: Reisende mit `canRecall` bekommen in der Liste einen "Zurueckholen"-Button.

### Tests

- Fortschrittsformel: Durchschnittsspieler = 1,0, Relativitaet zum eigenen Kader, Division durch 0
- Entsenden: Dauergrenzen, Spielerlimit inkl. bereits Reisender, verletzt/gesperrt/schon unterwegs,
  fremder Spieler, Duplikate, Leeren von Aufstellung und Bank
- Zurueckholen: erlaubt vor dem ersten Spieltag, abgelehnt danach, nicht unterwegs, fremder Spieler,
  leere Auswahl
- Spieltag: Gutschrift, Herunterzaehlen, Auszahlung mit Uebertrag, Kartenlimit, Log-Nachricht,
  Robustheit gegen einen fehlschlagenden Verein
- Seite: Balkenfuellstand und Deckelung, Vorschau-Schraffur inkl. Deckelung, Reiseziel-Karten,
  Aktiv-Markierung, Auswahlfilter, Wechsel-Warnung, Zurueckholen-Button
