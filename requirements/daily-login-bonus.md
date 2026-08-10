# Daily Login Bonus

## Beschreibung

Fuer jeden Kalendertag, an dem ein Nutzer das Spiel oeffnet, sammelt er einen Punkt. Aufeinanderfolgende Tage
bilden eine **Login-Serie** (Streak) und schalten an festen Meilensteinen Action Cards frei. Serie und
Belohnungs-Zaehler werden getrennt gefuehrt: der Zaehler laeuft in Zyklen von 30 Tagen, die Serie laeuft darueber
hinaus weiter.

## User Stories

- **US-DLB-01**: Als Spieler sammle ich pro Kalendertag hoechstens einen Login-Punkt, egal wie oft ich spiele.
- **US-DLB-02**: Als Spieler waechst meine Serie um eins, wenn ich am Folgetag wieder spiele.
- **US-DLB-03**: Als Spieler verliere ich Serie und Belohnungs-Fortschritt, wenn ich einen ganzen Tag auslasse.
- **US-DLB-04**: Als Spieler erhalte ich an Tag 3, 7, 15 und 30 eines Zyklus je eine Action Card.
- **US-DLB-05**: Als Spieler bekomme ich jede Belohnung innerhalb eines Zyklus nur einmal — auch bei mehrfachem
  Login, Reload oder erneutem Oeffnen des Dashboards.
- **US-DLB-06**: Als Spieler startet mein Belohnungs-Zaehler nach Tag 30 wieder bei 1, waehrend meine Serie
  weiterlaeuft (43 Tage aktiv = Serie 43, Zyklus 13/30).
- **US-DLB-07**: Als Spieler sehe ich oberhalb meines Vereinswappens eine kompakte Fortschrittsleiste mit den
  Meilensteinen 3, 7, 15 und 30. Erreichte Meilensteine sind markiert, der naechste ist hervorgehoben.
- **US-DLB-08**: Als Spieler oeffne ich per Klick/Tap auf die Leiste ein Overlay mit meiner Serie, meinem
  Zyklus-Fortschritt, den bereits erhaltenen und der naechsten Belohnung.
- **US-DLB-09**: Als Spieler sehe ich im Overlay die Top 10 Manager mit der laengsten aktuellen Serie; bin ich
  nicht dabei, wird meine eigene Platzierung zusaetzlich angezeigt.
- **US-DLB-10**: Als Spieler kann ich ueber "Alle anzeigen" die vollstaendige Rangliste oeffnen.
- **US-DLB-11**: Als Spieler nutze ich das Feature auf Mobile und Desktop in Deutsch und Englisch.

## Belohnungen je Zyklus

| Tag | Kategorie | Kartenpool (zufaellig eine davon) |
|---|---|---|
| 3 | Erholung | `FRESHNESS_5`, `FRESHNESS_10`, `FRESHNESS_20` |
| 7 | Training | `LEVEL_UP_PLAYER_40`, `LEVEL_UP_PLAYER_70`, `LEVEL_UP_PLAYER_100` |
| 15 | Spezial | `BONUS_100K`, `SPY`, `MOTIVATING_SPEECH` |
| 30 | Nachwuchs | `NEW_YOUTH_PLAYER_1`, `NEW_YOUTH_PLAYER_2`, `NEW_YOUTH_PLAYER_3` |

## Technische Anforderungen

### Was als "Login" zaehlt

- **TA-DLB-01**: JWTs laufen nicht ab — echte Login-Vorgaenge sind daher selten. Gezaehlt wird stattdessen jede
  App-Nutzung: die Auth-Middleware in `server/api.js` ruft `trackDailyLogin(user.id)` fuer jeden
  authentifizierten Request auf.
- **TA-DLB-02**: Eine prozesslokale `Map` (User-ID → Datum) verhindert, dass ueberhaupt ein DB-Zugriff
  entsteht, sobald der Nutzer heute schon gezaehlt wurde. Der Aufruf wird bewusst **nicht** awaited, damit er
  keine Antwortzeit kostet; scheitert er, wird der Map-Eintrag zurueckgenommen.
- **TA-DLB-03**: Der Kalendertag wird in **Serverzeit** bestimmt (`toDateKey`), damit ein Zeitzonenwechsel keinen
  zusaetzlichen Tag verschafft.

### Zustand (`server/helper/loginStreakHelper.js`)

- **TA-DLB-04**: Tabelle `user_login_streak`: `user_id` (PK), `last_login_date` (DATE), `streak`, `cycle_day`,
  `longest_streak`, `rewards_claimed` (CSV der bereits vergebenen Meilensteintage), `updated_at`.
- **TA-DLB-05**: `cycleDayForStreak(streak) = ((streak - 1) % 30) + 1`. Der Zyklus ist damit immer konsistent zur
  Serie ableitbar; `cycle_day` wird zusaetzlich persistiert.
- **TA-DLB-06**: `registerDailyLogin(userId, teamId)` ist pro Kalendertag idempotent: bei
  `dayDifference(last, heute) <= 0` passiert nichts. Bei Differenz 1 steigt die Serie, sonst faellt sie auf 1.
- **TA-DLB-07**: Beim Uebergang in einen neuen Zyklus (`cycleDay === 1`) wird `rewards_claimed` geleert.
- **TA-DLB-08**: Doppelvergabe ist doppelt abgesichert: ueber `rewards_claimed` und ueber eine In-Flight-Map, die
  gleichzeitige Aufrufe desselben Nutzers (Middleware + Dashboard-Endpunkt) auf eine Ausfuehrung serialisiert.
- **TA-DLB-09**: Die Karte wird nur aus Optionen gezogen, die `canReceiveActionCard` erlaubt — sonst haengt sie
  unabholbar als `pending`. Ist keine Option moeglich, gilt der Meilenstein trotzdem als vergeben.
- **TA-DLB-10**: Karten werden mit `state: 'pending'` eingefuegt und ueber den bestehenden Claim-Flow auf dem
  Dashboard abgeholt.
- **TA-DLB-11**: `getStreakState` meldet eine Serie als 0, wenn der letzte gewertete Login mehr als einen Tag
  zurueckliegt — die Anzeige wird also nicht erst beim naechsten Login korrigiert.
- **TA-DLB-12**: Das Leaderboard beruecksichtigt nur lebende Serien (`last_login_date >= gestern`).

### API (`server/routes/loginStreak.js`)

| Endpunkt | Zweck |
|---|---|
| `getDailyLoginStatus()` | Registriert den heutigen Login (idempotent) und liefert Serie, Zyklus, Meilensteine, bereits vergebene Belohnungen und frisch freigeschaltete Karten |
| `getLoginStreakLeaderboard(limit)` | Rangliste (Top `limit`, Default 10, max. 100) plus eigene Platzierung; **rein lesend** |

### Frontend

- **TA-DLB-13**: `client/partials/dailyLoginBar.js` rendert die Leiste. Sie wird in `StartPage` lazy
  instanziiert und gecacht, damit ein Dashboard-Rerender nicht neu laedt und flackert.
- **TA-DLB-14**: Positioniert direkt oberhalb des Vereinswappens; auf dem Dashboard selbst wird **kein**
  Leaderboard gerendert.
- **TA-DLB-15**: Styles in `client/style/pages/dashboard.css` (`.daily-login-*`). Inline-Styles nur fuer die
  berechneten `width`/`left`-Prozentwerte.
- **TA-DLB-16**: Faellt `getDailyLoginStatus` aus, rendert die Leiste ein leeres `<div>` — das Dashboard bleibt
  benutzbar.
- **TA-DLB-17**: Frisch freigeschaltete Belohnungen werden beim Mounten als Erfolgs-Toast gemeldet.

### Tests

- Tageswechsel-Logik: ein Punkt pro Tag, Fortsetzung, Reset nach Auslassen, DST-Sicherheit
- Zyklus-Mapping inkl. des Ticket-Beispiels (43 Tage → 13/30) und Rollover nach Tag 30
- Vergabe an Tag 3/7/15/30, keine Doppelvergabe, Verhalten ohne Team und bei erreichtem Kartenlimit
- Serialisierung gleichzeitiger Aufrufe
- Leaderboard-Ranking, eigene Platzierung ausserhalb der Top-Liste
- Rendering: Fuellstand, Meilenstein-Marker, erreicht/naechster Zustand, Overlay-Inhalte, "Alle anzeigen"
