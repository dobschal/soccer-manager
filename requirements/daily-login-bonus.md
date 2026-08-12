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
- **US-DLB-04**: Als Spieler erhalte ich an Tag 3, 7, 15, 23 und 30 eines Zyklus je eine Action Card.
- **US-DLB-05**: Als Spieler bekomme ich jede Belohnung innerhalb eines Zyklus nur einmal — auch bei mehrfachem
  Login, Reload oder erneutem Oeffnen des Dashboards.
- **US-DLB-14**: Als Spieler bekomme ich eine Belohnung **nicht automatisch**: Ist ein Meilenstein erreicht,
  liegt ein Geschenk-Emoji 🎁 ueber der Fortschrittsleiste. Erst mein Klick/Tap darauf vergibt die Karte.
- **US-DLB-15**: Als Spieler sehe ich die abgeholte Karte im gleichen Aufdeck-Overlay wie beim Mini-Game — ich
  drehe sie selbst um.
- **US-DLB-16**: Als Spieler geht mir eine nicht sofort abgeholte Belohnung nicht verloren: Das Geschenk bleibt
  liegen, bis ich es einsammle oder der 30-Tage-Zyklus neu startet. Habe ich mehrere Meilensteine liegen lassen,
  zeigt das Geschenk deren Anzahl und ein Tap holt alle nacheinander ab.
- **US-DLB-17**: Als Spieler verliere ich eine Belohnung nicht, wenn ich bei allen Karten des Pools am Limit bin —
  ich bekomme einen Hinweis und kann das Geschenk spaeter erneut antippen.
- **US-DLB-06**: Als Spieler startet mein Belohnungs-Zaehler nach Tag 30 wieder bei 1, waehrend meine Serie
  weiterlaeuft (43 Tage aktiv = Serie 43, Zyklus 13/30).
- **US-DLB-07**: Als Spieler sehe ich oberhalb meines Vereinswappens eine kompakte Fortschrittsleiste mit den
  Meilensteinen 3, 7, 15, 23 und 30. Erreichte Meilensteine sind markiert, der naechste ist hervorgehoben.
- **US-DLB-08**: Als Spieler oeffne ich per Klick/Tap auf die Leiste ein Overlay mit meiner Serie, meinem
  Zyklus-Fortschritt, den bereits erhaltenen und der naechsten Belohnung.
- **US-DLB-12**: Als Spieler sehe ich im Overlay unter "Belohnungen in diesem Zyklus" pro Meilenstein nur den Tag
  und die Belohnungskategorie (z. B. "Tag 3 — Erholungskarte"). Die einzelnen Karten und ihre
  Ziehungswahrscheinlichkeiten werden bewusst **nicht** aufgelistet, damit die Liste kurz und ueberschaubar bleibt.
- **US-DLB-13**: Als Spieler erkenne ich die Fortschrittsleiste auf dem hellen Dashboard-Hintergrund deutlich:
  Fuellstand und Marker sind im Info-Blauton der Buttons gehalten.
- **US-DLB-09**: Als Spieler sehe ich im Overlay die Top 10 Manager mit der laengsten aktuellen Serie; bin ich
  nicht dabei, wird meine eigene Platzierung zusaetzlich angezeigt.
- **US-DLB-10**: Als Spieler kann ich ueber "Alle anzeigen" die vollstaendige Rangliste oeffnen.
- **US-DLB-11**: Als Spieler nutze ich das Feature auf Mobile und Desktop in Deutsch und Englisch.

## Belohnungen je Zyklus

Pro Meilenstein wird **eine** Karte gezogen, gewichtet nach den Prozentwerten. Gezogen wird erst in dem Moment,
in dem der Spieler das Geschenk antippt — nicht schon beim Erreichen des Meilensteins.

| Tag | Kategorie | Kartenpool mit Wahrscheinlichkeit |
|---|---|---|
| 3 | Erholung | Schnelle Erholung `FRESHNESS_5` (50 %), Energie-Boost `FRESHNESS_10` (30 %), Volle Erholung `FRESHNESS_20` (20 %) |
| 7 | Training | Basis-Training `LEVEL_UP_PLAYER_40` (50 %), Fortgeschrittenes Training `LEVEL_UP_PLAYER_70` (30 %), Meister-Training `LEVEL_UP_PLAYER_100` (20 %) |
| 15 | Spezial | Geldbonus `BONUS_100K` (30 %), Spion `SPY` (30 %), Motivierende Ansprache `MOTIVATING_SPEECH` (30 %), Starspieler `STAR_PLAYER` (10 %) |
| 23 | Training | Basis-Training `LEVEL_UP_PLAYER_40` (30 %), Fortgeschrittenes Training `LEVEL_UP_PLAYER_70` (40 %), Meister-Training `LEVEL_UP_PLAYER_100` (30 %) |
| 30 | Jackpot | Millionengeschenk `MILLION_BONUS` (70 %), Starspieler `STAR_PLAYER` (30 %) |

Der Login-Bonus vergibt bewusst **keine** Nachwuchskarten: ueber Spieltage, Jugendakademie und Werbereisen
kommen davon schon genug ins Spiel. Tag 23 gibt daher eine Trainingskarte — hoeher gewichtet als an Tag 7,
damit der spaetere Meilenstein trotzdem mehr wert ist.

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
- **TA-DLB-06**: `registerDailyLogin(userId)` ist pro Kalendertag idempotent: bei
  `dayDifference(last, heute) <= 0` passiert nichts. Bei Differenz 1 steigt die Serie, sonst faellt sie auf 1.
  Die Funktion vergibt **keine** Karten — sie zaehlt nur den Tag.
- **TA-DLB-07**: Beim Uebergang in einen neuen Zyklus (`cycleDay === 1`) wird `rewards_claimed` geleert. Damit
  verfaellt auch ein nicht abgeholtes Geschenk des alten Zyklus.
- **TA-DLB-08**: Doppelvergabe ist doppelt abgesichert: ueber `rewards_claimed` und ueber eine In-Flight-Map in
  `claimLoginStreakRewards`, die einen Doppel-Tap auf das Geschenk auf eine Ausfuehrung serialisiert. Eine
  zweite In-Flight-Map serialisiert die parallelen `registerDailyLogin`-Aufrufe (Middleware + Dashboard).
- **TA-DLB-09**: Die Karte wird nur aus Optionen gezogen, die `canReceiveActionCard` erlaubt — sonst haengt sie
  unabholbar als `pending`. Ist keine Option moeglich, bleibt der Meilenstein **offen** (`limitReached`), damit
  die Belohnung nach dem Ausspielen einer Karte noch abgeholt werden kann.
- **TA-DLB-20**: `openRewards(cycleDay, claimed)` liefert alle erreichten, aber noch nicht abgeholten
  Meilensteine. `claimLoginStreakRewards(userId, teamId)` arbeitet sie der Reihe nach ab und bricht beim ersten
  ab, fuer den keine Karte moeglich ist. `rewards_claimed` wird nur geschrieben, wenn wirklich Karten entstanden
  sind.
- **TA-DLB-18**: Jede Pool-Option traegt ein `weight`, dessen Summe pro Meilenstein 100 ergibt. Fallen Optionen
  wegen des Kartenlimits weg, werden die Gewichte der uebrigen auf ihre eigene Summe normiert
  (`pickWeightedAction`) — ein Meilenstein liefert also weiterhin eine Karte, solange ueberhaupt eine erlaubt ist.
- **TA-DLB-19**: `server/routes/loginStreak.js` rechnet die Gewichte fuer den Client in Prozentwerte um
  (`milestones[].actions[].chance`); die Rohgewichte verlassen den Server nicht.
- **TA-DLB-10**: Karten werden mit `state: 'pending'` eingefuegt und direkt im Anschluss im Aufdeck-Overlay
  (`showCardClaimOverlay`, wie beim Mini-Game) umgedreht; `claimActionCard` setzt sie dabei auf `received`.
- **TA-DLB-11**: `getStreakState` meldet eine Serie als 0, wenn der letzte gewertete Login mehr als einen Tag
  zurueckliegt — die Anzeige wird also nicht erst beim naechsten Login korrigiert.
- **TA-DLB-12**: Das Leaderboard beruecksichtigt nur lebende Serien (`last_login_date >= gestern`).

### API (`server/routes/loginStreak.js`)

| Endpunkt | Zweck |
|---|---|
| `getDailyLoginStatus()` | Registriert den heutigen Login (idempotent) und liefert Serie, Zyklus, Meilensteine, bereits abgeholte (`claimed`) und abholbereite Belohnungen (`availableRewards`); vergibt **keine** Karten |
| `claimDailyLoginReward()` | Vergibt alle offenen Meilensteine an das Team des Aufrufers und liefert die `pending`-Karten fuer das Aufdeck-Overlay plus `limitReached` |
| `getLoginStreakLeaderboard(limit)` | Rangliste (Top `limit`, Default 10, max. 100) plus eigene Platzierung; **rein lesend** |

### Frontend

- **TA-DLB-13**: `client/partials/dailyLoginBar.js` rendert die Leiste. Sie wird in `StartPage` lazy
  instanziiert und gecacht, damit ein Dashboard-Rerender nicht neu laedt und flackert.
- **TA-DLB-14**: Positioniert direkt oberhalb des Vereinswappens; auf dem Dashboard selbst wird **kein**
  Leaderboard gerendert.
- **TA-DLB-15**: Styles in `client/style/pages/dashboard.css` (`.daily-login-*`), Kartenrahmen ueber Bootstrap
  (`card bg-info-subtle border-info`). Inline-Styles nur fuer die berechneten `width`/`left`-Prozentwerte.
  Die Leiste steht auf hellem Grund — Farben duerfen daher keine transparenten Weisstoene sein.
- **TA-DLB-16**: Faellt `getDailyLoginStatus` aus, rendert die Leiste ein leeres `<div>` — das Dashboard bleibt
  benutzbar.
- **TA-DLB-17**: Ist `availableRewards` nicht leer, legt `_renderGift()` ein absolut positioniertes 🎁 ueber die
  gesamte Leiste (`.daily-login-gift`). Sein Klick ruft `e.stopPropagation()`, damit nicht zusaetzlich das
  Detail-Overlay aufgeht; `_collecting` blockt einen Doppel-Tap. Die Leiste selbst zeigt keine Serien-Zeile mehr
  — die Serie steht im Overlay.

### Tests

- Tageswechsel-Logik: ein Punkt pro Tag, Fortsetzung, Reset nach Auslassen, DST-Sicherheit
- Zyklus-Mapping inkl. des Ticket-Beispiels (43 Tage → 13/30) und Rollover nach Tag 30
- `registerDailyLogin` vergibt keine Karte; `openRewards` meldet erreichte, nicht abgeholte Meilensteine
- Abholung: Karte an Tag 3/7/15/23/30, mehrere aufgestaute Meilensteine, keine Doppelvergabe, gebrochene Serie,
  offen bleibender Meilenstein bei erreichtem Kartenlimit
- Gewichtete Ziehung: Verteilung ueber viele Zuege, Normierung bei weggefallenen Optionen, Summe 100 je Pool
- Serialisierung gleichzeitiger Aufrufe (Login-Registrierung wie Geschenk-Doppeltap)
- Leaderboard-Ranking, eigene Platzierung ausserhalb der Top-Liste
- Rendering: Fuellstand, Meilenstein-Marker, erreicht/naechster Zustand, Overlay-Inhalte, "Alle anzeigen"
- Geschenk: sichtbar nur bei offener Belohnung, Anzahl-Badge ab zwei, Aufdeck-Overlay nach dem Tap,
  Limit-Hinweis statt leerem Overlay, Doppeltap-Schutz
