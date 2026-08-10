# Action Cards

## Beschreibung

Aktionskarten sind sammelbare Spielelemente, die der Nutzer nach jedem Spieltag erhält. Sie bieten verschiedene Vorteile wie Spieler-Level-Ups, Fitness-Wiederherstellung, Positionswechsel und mehr.

## User Stories

### Karten erhalten

- **US-AC-01**: Als Spieler erhalte ich nach jedem Spieltag automatisch neue Aktionskarten, damit ich strategische Vorteile sammeln kann.
- **US-AC-02**: Als Spieler sehe ich neue Karten als verdeckte Karten auf dem Dashboard, die ich durch Antippen aufdecken kann (Flip-Animation).
- **US-AC-03**: Als Spieler kann ich alle noch nicht aufgedeckten Karten mit einem "Skip"-Button oder ESC-Taste auf einmal einsammeln.

### Karten verwalten

- **US-AC-04**: Als Spieler sehe ich meine gesammelten Karten im Dashboard, gruppiert nach Kartentyp mit Anzahl-Badge.
- **US-AC-05**: Als Spieler kann ich Karten-Stacks anklicken, um eine Karte einzusetzen.
- **US-AC-06**: Als Spieler kann ich zwei gleichartige mergbare Karten zu einer höherwertigen Karte zusammenführen (Merge), wenn ich mindestens 2 Karten des gleichen Typs besitze.

### Karten einsetzen

- **US-AC-07**: Als Spieler kann ich Level-Up-Karten auf einen Spieler anwenden, um dessen Level um 1 zu erhöhen (bis zum Kartenlimit).
- **US-AC-08**: Als Spieler kann ich Fitness-Karten auf einen Spieler anwenden, um dessen Frische wiederherzustellen.
- **US-AC-10**: Als Spieler kann ich die Jugendspieler-Karte nutzen, um einen neuen Jugendspieler zu erhalten.
- **US-AC-11**: Als Spieler kann ich die Bonus-100K-Karte nutzen, um 100.000 Euro zu erhalten.
- **US-AC-12**: Als Spieler kann ich die Starspieler-Karte nutzen, um einem Spieler permanent +10% Level-Bonus in Spielen zu geben.
- **US-AC-13**: Als Spieler kann ich die Motivationsrede-Karte nutzen, um allen Spielern fuer den naechsten Spieltag +10% Level-Bonus zu geben.
- **US-AC-14**: Als Spieler kann ich die Spionage-Karte auf ein fremdes Team anwenden, um dessen Taktik, Aufstellung und aktive Motivationsrede einzusehen.
- **US-AC-15**: Als Spieler kann ich ueberzaehlige Karten auf dem Aktionskarten-Markt anderen Nutzern anbieten und auf deren Angebote bieten.
- **US-AC-16**: Als Spieler kann ich eine Karte "Medizinische Behandlung" auf einen **verletzten** Spieler anwenden und verkuerze damit dessen Ausfall um einen Spieltag. Ist niemand verletzt, behalte ich die Karte und werde darauf hingewiesen.
- **US-AC-17**: Als Spieler bekomme ich auf ein Marktangebot, das laenger als 24 Stunden offen liegt, automatisch ein Geldgebot von einem Bot-Team, damit meine Karten nicht unverkauft liegen bleiben.
- **US-AC-18**: Als Spieler kann ich die Karte "Millionengeschenk" einloesen und erhalte sofort 1.000.000 Euro.
- **US-AC-19**: Als Spieler sehe ich auf dem Dashboard einen Handlungsbedarf, sobald einer meiner Kartenstapel das Limit erreicht hat, damit ich keine weiteren Karten verliere.
- **US-AC-20**: Als Spieler sehe ich die Anzahl meiner verfuegbaren Aktionskarten in der Navigationsleiste der Startseite und komme per Klick direkt zur Kartenseite.

## Kartentypen

| Kartentyp | Effekt | Max. Level-Cap | Zusammenfuehrbar |
|---|---|---|---|
| LEVEL_UP_PLAYER_40 | +1 Level | 40 | Ja (2x -> 1x LEVEL_UP_PLAYER_70) |
| LEVEL_UP_PLAYER_70 | +1 Level | 70 | Ja (2x -> 1x LEVEL_UP_PLAYER_100) |
| LEVEL_UP_PLAYER_100 | +1 Level | 100 | Nein |
| FRESHNESS_5 | +5% Frische | - | Nein |
| FRESHNESS_10 | +10% Frische | - | Nein |
| FRESHNESS_20 | +20% Frische | - | Nein |
| NEW_YOUTH_PLAYER_1 | Neuer Jugendspieler (Bronze, Level 1-5, Talent 0,1-0,5) | - | Nein |
| NEW_YOUTH_PLAYER_2 | Neuer Jugendspieler (Silber, Level 5-10, Talent 0,3-0,75) | - | Nein |
| NEW_YOUTH_PLAYER_3 | Neuer Jugendspieler (Gold, Level 10-15, Talent 0,5-1,0) | - | Nein |
| BONUS_100K | +100.000 Euro | - | Nein |
| MILLION_BONUS | +1.000.000 Euro | - | Nein |
| STAR_PLAYER | Permanenter +10% Bonus | - | Nein |
| MOTIVATING_SPEECH | Team-weiter +10% Bonus (1 Spieltag) | - | Nein |
| SPY | Spionage-Karte | - | Nein |
| MEDICAL_TREATMENT | Verletzung eines Spielers -1 Spieltag | - | Nein |

Die Jugendspieler-Karten sind in drei Stufen unterteilt; welche Stufe ein Team erhaelt, haengt
vom Level der Jugendakademie ab (siehe [Youth Academy](youth-academy.md)).

## Karten-Verteilung (pro Spieltag)

Basiswerte aus `actionCardChances` (`server/helper/actionCardHelper.js`), ausgelegt auf 34 Spieltage pro Saison:

| Kartentyp | Basis-Wahrscheinlichkeit | ~pro Saison |
|---|---|---|
| LEVEL_UP_PLAYER_40 | 1.2 | ~40 |
| LEVEL_UP_PLAYER_70 | 0.3 | ~10 |
| LEVEL_UP_PLAYER_100 | 0.06 | ~2 |
| FRESHNESS_5 | 0 (nur via Fitness-Studio) | - |
| FRESHNESS_10 | 0.88 | ~30 |
| FRESHNESS_20 | 0 (nur via Fitness-Studio) | - |
| NEW_YOUTH_PLAYER_1/_2/_3 | 0 (nur via Jugendakademie) | - |
| BONUS_100K | 0.06 | ~2 |
| MILLION_BONUS | 0.006 (= BONUS_100K × 0,1) | ~0,2 |
| STAR_PLAYER | 0.01 | ~0,3 |
| MOTIVATING_SPEECH | 0.05 | ~2 |
| SPY | 0.15 | ~5 |
| MEDICAL_TREATMENT | 0 (nur via Arztpraxis: 0.044) | ~1,5 mit Arztpraxis |

Wahrscheinlichkeiten > 1 werden aufgeteilt: `floor(chance)` garantierte Karten plus eine
weitere mit der Wahrscheinlichkeit des Rests.

Die Basiswerte werden durch Gebaeude-Level ueberschrieben — Trainingsgelaende (LEVEL_UP),
Fitness-Studio (FRESHNESS), Jugendakademie (NEW_YOUTH_PLAYER_X) und Arztpraxis
(MEDICAL_TREATMENT). Die Karten, deren Basiswert 0 ist, entstehen ausschliesslich durch diese
Overrides.

## Limits

- **Gehaltene Karten pro Typ**: maximal 20 (`MAX_ACTION_CARDS_PER_TYPE`). Das Aufdecken einer Karte eines Typs, der dieses Limit erreicht hat, wird abgelehnt.
- **Jugendspieler-Karten pro Saison**: maximal 3 (`MAX_YOUTH_CARDS_PER_SEASON`); die Garantiekarte zaehlt mit.
- **Level-Ups pro Spieler pro Saison**: maximal 20 (gezaehlt ueber `player_history`).

## Technische Anforderungen

### Backend

- **TA-AC-01**: Aktionskarten werden in der Tabelle `action_card` gespeichert mit den Feldern: `id`, `team_id`, `action`, `played`, `state`, `season`, `youth_options`, `created_at`.
- **TA-AC-02**: Karten durchlaufen den Lebenszyklus: `pending` -> `received` -> `played`. Fuer den Markt kommt der Zwischenstatus `offered` hinzu (Karte ist gelistet und aus dem Inventar ausgelagert).
- **TA-AC-03**: Die Verteilung erfolgt in `_giveUsersActionCards()` nach jedem Spieltag.
- **TA-AC-04**: Gebaeude-Modifikatoren (Trainingsgelaende, Fitness-Studio, Jugendakademie, Arztpraxis) ueberschreiben die Basis-Wahrscheinlichkeiten. Die Reihenfolge ist Trainingsgelaende -> Fitness-Studio -> Jugendakademie -> Arztpraxis; jeder Override gewinnt gegen den vorherigen.
- **TA-AC-05**: Maximal 20 Level-Ups pro Saison pro Spieler.
- **TA-AC-06**: Frische wird auf maximal 1.0 begrenzt.
- **TA-AC-13**: Karten eines Typs, von dem das Team bereits `MAX_ACTION_CARDS_PER_TYPE` gehaltene (`received` + `pending`) Exemplare besitzt, werden **gar nicht erst vergeben** — sonst blieben sie dauerhaft `pending` und der Nutzer haengt im Aufdeck-Overlay fest.
- **TA-AC-14**: Nicht eingesammelte Karten verfallen: `deleteExpiredPendingCards()` loescht am naechsten Spieltag alle Karten im Status `pending`.
- **TA-AC-15**: Jedes Team ohne Jugendspieler, das in der laufenden Saison noch keine Jugendkarte erhalten hat, bekommt eine garantierte Jugendkarte. Deren Stufe richtet sich nach dem Akademie-Level (`YOUTH_ACADEMY_GUARANTEED_CARD`).
- **TA-AC-16**: Karteneffekte, die einen Spieler veraendern (Level-Up, Frische, Starspieler, Medizinische Behandlung), senden ein `PLAYER_UPDATED`-Event; Inventar-Aenderungen senden `ACTION_CARDS_CHANGED`.

### Medizinische Behandlung (MEDICAL_TREATMENT)

- **TA-AC-28**: Die Karte gibt es nur mit gebauter Arztpraxis (`MEDICAL_PRACTICE_CARD_CHANCES`, siehe [Buildings](buildings.md)). Ihr Basiswert in `actionCardChances` ist 0, sie taucht damit auch nicht in den Belohnungs-Pools von Mini-Game und WM-Wetten auf.
- **TA-AC-29**: Sie zieht `injury_days_left` des gewaehlten Spielers um **1** herunter. Erreicht der Zaehler damit 0, wird die Verletzung sofort komplett aufgehoben (`is_injured=0`, `injury_type=NULL`) — nicht erst beim naechsten Spieltag durch `_recoverInjuredPlayers`, damit der Spieler noch fuer das heutige Spiel zur Verfuegung steht.
- **TA-AC-30**: Abgelehnt wird die Karte, wenn der Spieler einem anderen Team gehoert (`error.playerNotInTeam`) oder nicht verletzt ist (`error.playerNotInjured`). In beiden Faellen bleibt die Karte unverbraucht.
- **TA-AC-31**: Die Log-Nachricht nennt die verbleibenden Spieltage (`log.cardMedicalTreatment`) bzw. meldet die Rueckkehr (`log.cardMedicalTreatmentHealed`), mit Icon `medkit` und Link auf den Spieler.

### Spionage-Karte (SPY)

- **TA-AC-17**: Die ID des ausgespaehten Teams wird ueber den `position`-Parameter von `useActionCard` uebergeben (SPY hat keine Aufstellungsposition).
- **TA-AC-18**: Der Report ist ein **Snapshot** zum Zeitpunkt des Einsatzes: Taktik, Aufstellung und aktive Motivationsrede werden eingefroren, damit spaetere Taktikaenderungen des Gegners den Report nicht mehr veraendern (#513).
- **TA-AC-19**: Persistiert in `team.last_spied_team_id`, `team.last_spied_at` und `team.last_spied_snapshot` (JSON) des ausspaehenden Teams.

### Aktionskarten-Markt

- **TA-AC-20**: Nutzer koennen Karten einzeln oder als Bundle anbieten (`createActionCardOffer(actionCardIds, comment)`); ein Bundle zaehlt als **ein** Angebot.
- **TA-AC-21**: Maximal 10 offene Angebote pro Team (`MAX_OPEN_CARD_OFFERS`).
- **TA-AC-22**: Gelistete Karten werden aus dem Inventar ausgelagert (Escrow, Status `offered`) und beim Zurueckziehen wieder freigegeben.
- **TA-AC-23**: Gebote koennen Geld und/oder eigene Karten enthalten (`bidOnActionCardOffer(offerId, money, cardIds, comment)`).
- **TA-AC-24**: Aenderungen am fuer den Nutzer relevanten Marktzustand loesen `ACTION_CARD_MARKET_CHANGED` aus.
- **TA-AC-25**: Abgeschlossene Trades bleiben als Historie abrufbar (`getActionCardTradeHistory`).

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getActionCards` | Gibt alle Karten im Status `received` zurueck |
| `getPendingActionCards` | Gibt noch nicht aufgedeckte Karten zurueck |
| `claimActionCard(cardId)` | Deckt eine Karte auf (pending -> received) |
| `useActionCard(card, player, position)` | Setzt eine Karte ein; `position` traegt bei SPY die Team-ID, bei Jugendkarten die gewaehlte Option |
| `mergeCards(card1, card2)` | Fuehrt zwei gleichartige Karten zusammen |
| `getYouthPlayerOptions(cardId)` | Liefert 3 Jugendspieler-Optionen fuer eine NEW_YOUTH_PLAYER_X-Karte |

Aktionskarten-Markt (`server/routes/actionCardMarket.js`):

| Endpunkt | Beschreibung |
|---|---|
| `getActionCardMarket` | Angebote, eigene Angebote, eigene Gebote und eigene Karten |
| `createActionCardOffer(actionCardIds, comment)` | Karte(n) anbieten |
| `cancelActionCardOffer(offerId)` | Eigenes Angebot zurueckziehen |
| `bidOnActionCardOffer(offerId, money, cardIds, comment)` | Gebot abgeben |
| `acceptActionCardBid(bidId)` / `rejectActionCardBid(bidId)` | Gebot annehmen/ablehnen |
| `cancelActionCardBid(bidId)` | Eigenes Gebot zurueckziehen |
| `getActionCardTradeHistory` | Abgeschlossene Karten-Trades |

### Frontend

- **TA-AC-08**: Karten werden als gestapelte Karten-Grafiken angezeigt (max. 5 sichtbar pro Stack).
- **TA-AC-09**: Aufdecken neuer Karten mit 3D-Flip-Animation.
- **TA-AC-10**: Merge-Animation: Beide Karten faden aus, neue hoeherwertige Karte erscheint.
- **TA-AC-11**: Merge-Badge (rot) wird angezeigt, wenn eine Zusammenfuehrung moeglich ist.
- **TA-AC-12**: Karten-Bilder liegen als SVG unter `assets/action-cards/`, die Jugendkarten als `new-youth-player-{1,2,3}.svg`, die Behandlungskarte als `medical-treatment.svg` (rote Akzentfarbe `#E63946`, Arztkoffer mit rotem Kreuz und EKG-Linie, drei Sterne).
- **TA-AC-32**: Beim Einsetzen einer MEDICAL_TREATMENT-Karte listet die Spielerauswahl **nur verletzte** Spieler. Ist keiner verletzt, oeffnet sich kein Overlay: es kommt ein Hinweis-Toast (`actionCards.noInjuredPlayer`) und die Karte bleibt im Stapel.
- **TA-AC-26**: Beim Aufdecken einer NEW_YOUTH_PLAYER_X-Karte oeffnet sich ein Auswahl-Overlay mit drei generierten Spielern (siehe [Youth Academy](youth-academy.md)).
- **TA-AC-27**: Das Kartenlimit pro Typ wird beim Aufdecken als Toast gemeldet (`error.actionCardLimitReached`). Die Client-Kopie von `MAX_ACTION_CARDS_PER_TYPE` liegt in `client/pages/dashboard/actionCards.js` und muss mit dem Server-Wert synchron bleiben.

### Automatische Bot-Gebote (#505)

- **TA-AC-33**: `placeBotCardBids()` in `server/helper/actionCardMarketHelper.js` laeuft als Teil von
  `makeBotMoves()` im 12-Stunden-CRON.
- **TA-AC-34**: Beruecksichtigt werden nur offene Angebote von echten Managern, die aelter als
  `BOT_CARD_BID_MIN_AGE_HOURS` (24) sind und noch kein offenes Bot-Gebot haben.
- **TA-AC-35**: Der Gebotsbetrag ist die Summe der Einzelpreise aus `BOT_CARD_BID_PRICES`, variiert um
  `BOT_CARD_BID_VARIANCE` (±10%). Enthaelt ein Buendel eine Karte ohne Preis, wird das Angebot uebersprungen.

  | Karte | Gebot |
  |---|---|
  | Nachwuchsspieler (`NEW_YOUTH_PLAYER_1`) | 100.000 € |
  | Nachwuchstalent (`NEW_YOUTH_PLAYER_2`) | 200.000 € |
  | Nachwuchsstar (`NEW_YOUTH_PLAYER_3`) | 300.000 € |
  | Starspieler (`STAR_PLAYER`) | 500.000 € |
  | Motivierende Ansprache (`MOTIVATING_SPEECH`) | 200.000 € |
  | Basis-Training (`LEVEL_UP_PLAYER_40`) | 40.000 € |
  | Fortgeschrittenes Training (`LEVEL_UP_PLAYER_70`) | 75.000 € |
  | Meister-Training (`LEVEL_UP_PLAYER_100`) | 150.000 € |
  | Schnelle Erholung (`FRESHNESS_5`) | 5.000 € |
  | Energie-Boost (`FRESHNESS_10`) | 10.000 € |
  | Volle Erholung (`FRESHNESS_20`) | 20.000 € |
  | Spion (`SPY`) | 20.000 € |
  | Geldbonus (`BONUS_100K`) | 90.000 € |
  | Millionengeschenk (`MILLION_BONUS`) | 900.000 € |
  | Medizinische Behandlung (`MEDICAL_TREATMENT`) | 30.000 € |

  Der Geldbonus liegt bewusst unter seinem Nennwert von 100.000 €, sonst waere er ein risikoloser Gelddrucker.
- **TA-AC-36**: Pro Kalendertag erhaelt ein Manager hoechstens **ein** Bot-Gebot, unabhaengig von der Zahl seiner
  Angebote. Bietendes Team ist ein zufaelliges Bot-Team, das sich den Betrag leisten kann.
- **TA-AC-37**: Das Gebot laeuft ueber den regulaeren `placeBid`-Pfad, erzeugt also dieselbe Log-Nachricht und
  Benachrichtigung wie ein Gebot von einem Mitspieler.

### Millionengeschenk (#537)

- **TA-AC-38**: `MILLION_BONUS` teilt sich den Auszahlungspfad mit `BONUS_100K`; die Betraege stehen in
  `CASH_CARD_AMOUNTS` (`server/helper/actionCardHelper.js`), nicht in der Verzweigung.
- **TA-AC-39**: Die Wahrscheinlichkeit ist bewusst als `0.06 * 0.1` notiert, damit sie automatisch mitzieht,
  wenn der Geldbonus angepasst wird.
- **TA-AC-40**: Die Karte ist Teil der Admin-Geschenkliste (`GIFTABLE_ACTION_CARD_TYPES`) und der Bot-Preisliste,
  aber **nicht** zusammenfuehrbar und **nicht** im Belohnungspool des Login-Bonus.
- **TA-AC-41**: Motiv `client/assets/action-cards/bonus-1m.svg` — dieselbe Geometrie wie die Geldbonus-Karte in
  einer Gold-Palette, damit sich die beiden Geldkarten auf einen Blick unterscheiden.

### Kartenlimit im Handlungsbedarf (#506)

- **TA-AC-42**: `getDashboardUrgencies` meldet `ACTION_CARDS_FULL` mit der Anzahl der Kartentypen, die
  `MAX_ACTION_CARDS_PER_TYPE` erreicht haben. Gezaehlt werden nur abgeholte, ungespielte Karten
  (`played=0 AND state='received'`) — genau die, die gegen das Limit zaehlen.
- **TA-AC-43**: Der Eintrag hat kein "alles gut"-Gegenstueck (`hideOk`): eine Dauer-Zeile fuer etwas, das nur im
  Ausnahmefall relevant ist, waere nur Rauschen.

### Kartenzaehler in der Navigation (#523)

- **TA-AC-44**: Das Dashboard zeigt die Zahl der spielbaren Karten in der Navigationsleiste und verlinkt auf
  `#my-team?sub_page=cards`. Ausstehende (`pending`) Karten zaehlen nicht mit — sie muessen erst abgeholt werden.
- **TA-AC-45**: Bei `ACTION_CARDS_CHANGED` wird nur der Zahlen-Span per `textContent` aktualisiert. Ein
  Re-Render des Dashboards wuerde die Startseite samt 3D-Szene und Charts neu aufbauen.

### Tests

- Unit-Tests fuer alle Karteneffekte und Level-Caps
- Tests fuer Merge-Validierung (verschiedene Typen, nicht-zusammenfuehrbare Karten)
- Verteilungswahrscheinlichkeits-Tests (Simulation ueber 10.000 Spieltage)
- Tests fuer Gebaeude-Modifikatoren (Trainingsgelaende, Fitness-Studio, Jugendakademie, Arztpraxis)
- MEDICAL_TREATMENT: verkuerzt um einen Spieltag, hebt die Verletzung beim letzten Spieltag auf, lehnt gesunde und fremde Spieler ab
- Kartenlimit pro Typ: Aufdecken wird abgelehnt, Vergabe wird uebersprungen
- Jugendkarten-Deckel pro Saison inkl. Garantiekarte
- SPY-Snapshot bleibt stabil, wenn der Gegner danach die Taktik aendert
- Markt: Angebots-Obergrenze, Escrow beim Listen/Zurueckziehen, Bundle zaehlt als ein Angebot
- Bot-Gebote: Preisliste je Kartentyp, Summenbildung bei Buendeln, ±10%-Grenzen, ein Gebot pro Manager und Tag,
  Ueberspringen bei unbekannter Karte oder zu klammem Bot-Team
- Millionengeschenk: Wahrscheinlichkeit als Zehntel des Geldbonus, Auszahlung 1.000.000 €, Bot-Gebotspreis
- Handlungsbedarf bei vollem Kartenstapel, inklusive Abgrenzung gegen ausstehende und gespielte Karten
- Kartenzaehler in der Navigation: Ladewert, Live-Aktualisierung, Verhalten bei fehlgeschlagenem Refresh
