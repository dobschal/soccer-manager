# Jugendspieler (Youth Players)

## Beschreibung

Jugendspieler sind Nachwuchstalente, die ab Alter 15 im Jugendkader erscheinen und durch Training, Freundschaftsspiele und Ruhe entwickelt werden. Ab 16 koennen sie ins A-Team befoerdert werden, spaetestens mit 18 muessen sie befoerdert werden, da sie mit 19 automatisch entlassen werden.

## User Stories

- **US-YTH-01**: Als Spieler sehe ich meinen Jugendkader im "Youth Team"-Tab der My-Team-Seite.
- **US-YTH-02**: Als Spieler kann ich **jedem Jugendspieler einzeln** einen von drei Trainingsmodi zuweisen: Training, Freundschaftsspiel, Ruhe — oder ihn ohne Modus lassen.
- **US-YTH-09**: Als Spieler sehe ich pro Modus, wie viele Slots belegt sind, und erhalte eine Warnung, wenn ein Modus voll ist.
- **US-YTH-10**: Als Spieler schalte ich durch den Ausbau der Jugendakademie mehr Trainings- und Freundschaftsspiel-Slots frei.
- **US-YTH-03**: Als Spieler sehe ich pro Jugendspieler: Name, Position, Alter, Level, Moral und Fitness.
- **US-YTH-04**: Als Spieler kann ich einen Jugendspieler ab Alter 16 ins A-Team befoerdern.
- **US-YTH-13**: Als Spieler sehe ich in der Historie eines Spielers, dass er aus der eigenen Jugend
  befoerdert wurde (mit Saison, Spieltag und Vereinsname).
- **US-YTH-05**: Als Spieler trenne ich mich von einem Jugendspieler ueber den Verkauf (US-YTH-12); einen
  separaten "Entlassen"-Button gibt es seit #524 nicht mehr.
- **US-YTH-11**: Als Spieler sehe ich neben dem Level den aktuellen Marktwert jedes Jugendspielers.
- **US-YTH-12**: Als Spieler kann ich einen Jugendspieler zum aktuellen Marktpreis verkaufen und werde vorher
  mit Name und Betrag um Bestaetigung gebeten.
- **US-YTH-06**: Als Spieler erhalte ich eine Warnung, wenn ein Jugendspieler 18 wird (automatische Entlassung naechste Saison).
- **US-YTH-07**: Als Spieler erhalte ich neue Jugendspieler ueber die NEW_YOUTH_PLAYER_1/_2/_3 Aktionskarten (max. 3 pro Saison, Stufe abhaengig vom Akademie-Level).
- **US-YTH-08**: Als Spieler sehe ich einen Countdown-Timer bis zum naechsten Spieltag auf dem Youth-Tab.

## Jugendspieler-Eigenschaften

| Eigenschaft | Bereich | Sichtbar | Beschreibung |
|---|---|---|---|
| level | 0.1 - ~30.0 | Ja | Staerke (Dezimalzahl) |
| talent | 0.0 - 1.0 | Nein (versteckt) | Wachstumspotenzial |
| moral | 0.0 - 1.0 | Ja | Motivation |
| fitness | 0.0 - 1.0 | Ja | Koerperliche Verfassung |

## Trainingsmodi und Auswirkungen (pro Spieltag)

Der Modus wird **pro Jugendspieler** gesetzt (`youth_player.training_mode`). Spieler ohne
eigenen Modus fallen auf die Team-Einstellung `team.youth_training_mode` zurueck (Legacy,
Standard `rest`).

| Modus | Fitness | Moral | Level-Bonus |
|---|---|---|---|
| Training | +2% | -5% | 1.2x (20% mehr) |
| Freundschaftsspiel | -4% | +5% | 1.0x (Standard) |
| Ruhe | +6% | +4% | 0.3x (70% weniger) |

Alle Werte mit +-10% Zufallsfaktor.

### Slot-Kapazitaet pro Modus

Wie viele Jugendspieler gleichzeitig in einem Modus stehen duerfen, haengt vom Level der
Jugendakademie ab (`slotsForMode` in `server/routes/youth.js`, `MAX_SLOTS_PER_MODE = 4`):

| Modus | Akademie L1 | L2 | L3 |
|---|---|---|---|
| Training | 2 | 3 | 4 |
| Freundschaftsspiel | 2 | 3 | 4 |
| Ruhe | 4 | 4 | 4 |

`rest` hat immer die volle Kapazitaet; `training` und `friendly_match` berechnen sich als
`max(2, min(4, akademieLevel + 1))`. Ist ein Modus voll, wird die Zuweisung mit
`error.youthModeSlotsFull` abgelehnt.

### Idealer Trainingsrhythmus

2x Training, 1x Freundschaftsspiel, 1x Ruhe - dieser Rhythmus optimiert die Entwicklung.

### Level-Gewinn-Formel

```
gain = BASE_LEVEL_GAIN * (1 + talent * 2.5) * modeBonus * avgCondition * randomFactor

BASE_LEVEL_GAIN = 0.2
avgCondition = (fitness + moral) / 2
randomFactor = 0.9 bis 1.1
```

### Entwicklungsziele

- Talent 1.0, Level 10, perfekter Rhythmus: Level 30 mit 16 Jahren
- Minimum: Level 10 mit 18 Jahren (auch bei schlechtestem Rhythmus)

## Technische Anforderungen

### Datenbank

- **TA-YTH-01**: Tabelle `youth_player`: `id`, `team_id`, `name`, `position`, `level` (DECIMAL(4,3)), `talent` (DECIMAL(4,3)), `moral` (DECIMAL(4,3)), `fitness` (DECIMAL(4,3)), `hair_color`, `skin_color`, `birth_season`, `training_mode` (VARCHAR(20), nullable), `created_at`.
- **TA-YTH-02**: `youth_player.training_mode` haelt den individuellen Modus (`training` / `friendly_match` / `rest` / `NULL`). `team.youth_training_mode` (VARCHAR(20), Standard `'rest'`) existiert weiter als **Fallback** fuer Spieler ohne eigenen Modus.
- **TA-YTH-03**: Jedes neue Team erhaelt 3 zufaellige Jugendspieler.

### Altersberechnung

- **TA-YTH-04**: Alter = `15 + (aktuelleSaison - birth_season)`.
- **TA-YTH-05**: Neue Jugendspieler starten mit `birth_season = aktuelleSaison` (Alter 15).

### Befoerderung ins A-Team

- **TA-YTH-06**: Voraussetzung: Alter >= 16 (kein Level-Minimum).
- **TA-YTH-07**: Level wird abgerundet (Floor) beim Uebertrag.
- **TA-YTH-08**: Karrierelaenge: 20-23 Jahre (zufaellig).
- **TA-YTH-09**: Anfangs-Freshness = Jugend-Fitness.
- **TA-YTH-10**: Jugendspieler-Eintrag wird geloescht, neuer Spieler-Eintrag erstellt.
- **TA-YTH-29**: Die Befoerderung schreibt einen `player_history`-Eintrag vom Typ `YOUTH_PROMOTION`
  mit dem Vereinsnamen als `value` (Saison und Spieltag der Befoerderung). Der Spieler-Dialog rendert
  ihn als `player.historyYouthPromotion`. Spieler, die vor dieser Aenderung befoerdert wurden, haben
  keinen solchen Eintrag — die Daten dafuer existieren nicht mehr.

### Automatische Entlassung

- **TA-YTH-11**: Jugendspieler ab 19 Jahren werden beim Saisonwechsel automatisch geloescht.
- **TA-YTH-12**: Warnung bei Alter 18: Log-Nachricht an das Team. Wird **einmal pro Saison** verschickt (erster
  CRON-Tick der Saison), nicht bei jedem Tick — abgesichert ueber `app_setting.last_youth_warning_season`.

### Training

- **TA-YTH-13**: `processYouthTraining()` wird bei jedem Spieltag aufgerufen und trainiert jeden Spieler nach seinem individuellen `training_mode`.
- **TA-YTH-14**: Fitness und Moral werden auf [0, 1] begrenzt.
- **TA-YTH-15**: Talent-Wert wird nie an den Client zurueckgegeben (versteckt).
- **TA-YTH-25**: Marktwert (`calculateYouthPlayerValue`, #524):
  `40.000.000 € × 0,9330329915368074^(100 − Level) × (0,5 + Talent)`. Der Level-Term ist dieselbe Kurve
  wie bei Profispielern, damit ein Jugendspieler und ein frisch befoerderter Profi gleichen Levels in
  derselben Groessenordnung liegen. Der Altersterm der Profiformel greift unter 22 nicht — jeder
  Jugendspieler ist 15-18.
- **TA-YTH-26**: Der Talentfaktor (`YOUTH_VALUE_TALENT_WEIGHT` = 0,5) spannt den Preis um ±50% auf: bei
  Jugendspielern ist das Talent der eigentliche Wert. Ein 1,0-Talent bringt rund das 2,5-fache eines
  0,1-Talents gleichen Levels.
- **TA-YTH-27**: Der Preis wird **serverseitig** berechnet und als `market_value` mitgeliefert, weil er vom
  versteckten Talent abhaengt. Damit laesst sich das Talent aus dem Preis allerdings zurueckrechnen —
  eine bewusste Abschwaechung von TA-YTH-15.
- **TA-YTH-28**: `sellYouthPlayer` entfernt den Spieler **zuerst** und bucht danach die Gutschrift. Andersherum
  wuerde ein Fehler beim Loeschen dem Verein Geld *und* Spieler lassen.
- **TA-YTH-23**: `setYouthPlayerTrainingMode` prueft Team-Eigentum, gueltigen Modus und freie Slots (`countYouthPlayersInMode` gegen `slotsForMode`). Der eigene Spieler wird bei der Zaehlung ausgeschlossen, damit ein Wechsel innerhalb desselben Modus nicht am Limit scheitert.
- **TA-YTH-24**: Bei tatsaechlicher Aenderung wird `YOUTH_PLAYER_TRAINING_MODE_CHANGED` an den Team-Nutzer gesendet (Payload: `{ youthPlayerId, previousMode, newMode }`). Die betroffene Zeile aktualisiert sich in place, die Seite rendert nicht komplett neu.
- **TA-YTH-25**: `mode = null` entfernt die Zuweisung wieder (Spieler faellt auf den Team-Fallback zurueck).

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getYouthTeam` | Jugendspieler (ohne Talent, mit `market_value`), individuelle Modi, Akademie-Level, Slots pro Modus, Saison |
| `sellYouthPlayer(id)` | Verkauft den Jugendspieler zum Marktwert und schreibt den Betrag gut |
| `setYouthPlayerTrainingMode(youthPlayerId, mode)` | Modus eines einzelnen Jugendspielers setzen (`training`/`friendly_match`/`rest`/`null`) |
| `setYouthTrainingMode(mode)` | Team-weiter Fallback-Modus (Legacy) |
| `promoteYouthPlayer(youthPlayerId)` | Jugendspieler ins A-Team befoerdern |
| `fireYouthPlayer(youthPlayerId)` | Jugendspieler entfernen — seit #524 nicht mehr aus der UI aufrufbar; wird intern noch fuer Verkauf und automatische Entlassung ab 19 genutzt |

### Frontend

- **TA-YTH-16**: Youth-Team als Tab auf der My-Team-Seite (`?sub_page=youth`).
- **TA-YTH-17**: Trainingsmodus-Auswahl **pro Spielerzeile** (Icons: Blitz, Fussball, Bett), mit Slot-Zaehler pro Modus und Toast-Warnung, wenn ein Modus voll ist.
- **TA-YTH-18**: Countdown-Timer bis zum naechsten Spieltag (HH:MM:SS).
- **TA-YTH-19**: Spielertabelle: Name, Position, Alter, Level (2 Dezimalen), Moral (Fortschrittsbalken), Fitness (Fortschrittsbalken), Aktionen.
- **TA-YTH-20**: Befoerdern-Button nur aktiv ab Alter 16.
- **TA-YTH-23**: Spaltenreihenfolge: … Level, **Marktwert**, Moral, Fitness, Trainingsmodus, Aktionen (#524).
- **TA-YTH-24**: Aktionen pro Zeile: Befoerdern, **Verkaufen** — der Entlassen-Button wurde mit #524 entfernt,
  weil der Verkauf ihn vollstaendig ersetzt.
- **TA-YTH-22**: Bestaetigungsdialoge vor Befoerderung und Verkauf.
- **TA-YTH-30**: Seitenaufbau (#563): Titel, **Mannschaftsfoto**, Spielerliste, Alterswarnung,
  Trainingsmodus-Karten. Die Modus-Karten stehen bewusst unter der Liste.
- **TA-YTH-31**: Das Mannschaftsfoto zeigt alle Jugendspieler in **genau zwei** versetzten Reihen: die
  vordere (untere) Reihe nimmt `floor(n/2) + 1` Spieler, die hintere den Rest - also 2+1 bei drei,
  3+1 bei vier, 3+2 bei fuenf Spielern usw. Bis zu zwei Spieler stehen ohne hintere Reihe. Beide
  Reihen sind zentriert und teilen ein Raster aus gleich breiten Slots, damit die hintere Reihe in den
  Luecken der vorderen steht; wenn die Differenz der Reihenlaengen gerade ist, wuerde Zentrieren die
  Reihen uebereinander legen - dann wird die hintere per `.youth-squad-row--offset` um einen halben
  Slot verschoben.
- **TA-YTH-32**: Je Spieler Portrait (SVG, nach dem Mounten asynchron nachgeladen), Namensschild und
  Positions-Badge; unter dem Foto Vereinsname und Saison. Ohne Jugendspieler entfaellt das Foto.
- **TA-YTH-33**: Passt der Kader nicht in die Breite, scrollt das Foto **horizontal** (beide Reihen
  gemeinsam in `.youth-squad-scroller`) - es wird nie eine dritte Reihe umgebrochen.
- **TA-YTH-34**: Der Hintergrund ist das 3D-Standbild der eigenen Jugendakademie
  (`captureBuilding('youth_academy', {view: BUILDING_BACKDROP_VIEWS.youth_academy})`, 960x400).
  Es kommt aus dem gemeinsamen Cache (`client/lib/buildingStill.js`); nur wenn dort noch keins liegt,
  stellt die Seite einmalig ein unsichtbares `StadiumCanvas` auf, fotografiert und gibt den
  WebGL-Kontext sofort wieder frei. Bis dahin - und ohne WebGL - bleibt das gemalte Level-Bild
  (`youth-squad-photo--level-1..3`) der Hintergrund.

### Tests

- Mannschaftsfoto: Platzhalter je Spieler, Reihenaufteilung (2+1 / 3+1 / 3+2 / ...), Versatz-Klasse,
  Scroller, gemaltes Fallback inkl. Level-Clamping, Reihenfolge Foto -> Liste -> Modus-Karten,
  leerer Kader
- Akademie-Standbild: Cache-Treffer vermeidet die zweite Szene, sonst Off-Screen-Canvas mit dem
  Backdrop-Ausschnitt; Standbild wird gecacht und der WebGL-Kontext auch dann freigegeben, wenn die
  Szene nie hochkommt
- Training-Effekte auf Level, Moral und Fitness
- Individueller `training_mode` schlaegt den Team-Fallback; Spieler ohne Modus nutzen den Fallback
- Slot-Kapazitaet pro Modus je Akademie-Level; volle Modi werden abgelehnt
- Wechsel innerhalb desselben Modus scheitert nicht am Limit (eigener Spieler ausgeschlossen)
- `mode = null` entfernt die Zuweisung
- Befoerderungs-Altersbeschraenkung (>= 16)
- Team-Eigentuemerpruefung bei Befoerderung/Entlassung/Modus-Zuweisung
- Automatische Entlassung ab 19
- Talent ist nicht im API-Response enthalten
- Marktwert: steigt mit Level und Talent, Talentspanne ±50%, kein Altersabschlag, ganzzahlig, robust gegen
  fehlendes oder ueberhohes Talent
- Verkauf: Gutschrift, Entfernen vor Buchung, Log-Eintrag, Ablehnung fremder und unbekannter Spieler
