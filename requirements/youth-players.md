# Jugendspieler (Youth Players)

## Beschreibung

Jugendspieler sind Nachwuchstalente, die ab Alter 15 im Jugendkader erscheinen und durch Training, Freundschaftsspiele und Ruhe entwickelt werden. Ab 16 koennen sie ins A-Team befoerdert werden, spaetestens mit 18 muessen sie befoerdert werden, da sie mit 19 automatisch entlassen werden.

## User Stories

- **US-YTH-01**: Als Spieler sehe ich meinen Jugendkader im "Youth Team"-Tab der My-Team-Seite.
- **US-YTH-02**: Als Spieler kann ich zwischen drei Trainingsmodi waehlen: Training, Freundschaftsspiel, Ruhe.
- **US-YTH-03**: Als Spieler sehe ich pro Jugendspieler: Name, Position, Alter, Level, Moral und Fitness.
- **US-YTH-04**: Als Spieler kann ich einen Jugendspieler ab Alter 16 ins A-Team befoerdern.
- **US-YTH-05**: Als Spieler kann ich einen Jugendspieler jederzeit entlassen.
- **US-YTH-06**: Als Spieler erhalte ich eine Warnung, wenn ein Jugendspieler 18 wird (automatische Entlassung naechste Saison).
- **US-YTH-07**: Als Spieler erhalte ich neue Jugendspieler ueber die NEW_YOUTH_PLAYER Aktionskarte (~2-3 pro Saison).
- **US-YTH-08**: Als Spieler sehe ich einen Countdown-Timer bis zum naechsten Spieltag auf dem Youth-Tab.

## Jugendspieler-Eigenschaften

| Eigenschaft | Bereich | Sichtbar | Beschreibung |
|---|---|---|---|
| level | 0.1 - ~30.0 | Ja | Staerke (Dezimalzahl) |
| talent | 0.0 - 1.0 | Nein (versteckt) | Wachstumspotenzial |
| moral | 0.0 - 1.0 | Ja | Motivation |
| fitness | 0.0 - 1.0 | Ja | Koerperliche Verfassung |

## Trainingsmodi und Auswirkungen (pro Spieltag)

| Modus | Fitness | Moral | Level-Bonus |
|---|---|---|---|
| Training | +2% | -5% | 1.2x (20% mehr) |
| Freundschaftsspiel | -4% | +5% | 1.0x (Standard) |
| Ruhe | +6% | +4% | 0.3x (70% weniger) |

Alle Werte mit +-10% Zufallsfaktor.

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

- **TA-YTH-01**: Tabelle `youth_player`: `id`, `team_id`, `name`, `position`, `level` (DECIMAL(4,3)), `talent` (DECIMAL(4,3)), `moral` (DECIMAL(4,3)), `fitness` (DECIMAL(4,3)), `hair_color`, `skin_color`, `birth_season`, `created_at`.
- **TA-YTH-02**: `team.youth_training_mode` (VARCHAR(20), Standard: 'rest').
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

### Automatische Entlassung

- **TA-YTH-11**: Jugendspieler ab 19 Jahren werden beim Saisonwechsel automatisch geloescht.
- **TA-YTH-12**: Warnung bei Alter 18: Log-Nachricht an das Team.

### Training

- **TA-YTH-13**: `processYouthTraining()` wird bei jedem Spieltag aufgerufen.
- **TA-YTH-14**: Fitness und Moral werden auf [0, 1] begrenzt.
- **TA-YTH-15**: Talent-Wert wird nie an den Client zurueckgegeben (versteckt).

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getYouthTeam` | Jugendspieler (ohne Talent), Trainingsmodus, Saison |
| `setYouthTrainingMode(mode)` | Trainingsmodus setzen (training/friendly_match/rest) |
| `promoteYouthPlayer(youthPlayerId)` | Jugendspieler ins A-Team befoerdern |
| `fireYouthPlayer(youthPlayerId)` | Jugendspieler entlassen |

### Frontend

- **TA-YTH-16**: Youth-Team als Tab auf der My-Team-Seite (`?sub_page=youth`).
- **TA-YTH-17**: Trainingsmodus-Auswahl mit 3 Buttons (Icons: Blitz, Fussball, Bett).
- **TA-YTH-18**: Countdown-Timer bis zum naechsten Spieltag (HH:MM:SS).
- **TA-YTH-19**: Spielertabelle: Name, Position, Alter, Level (2 Dezimalen), Moral (Fortschrittsbalken), Fitness (Fortschrittsbalken), Aktionen.
- **TA-YTH-20**: Befoerdern-Button nur aktiv ab Alter 16.
- **TA-YTH-21**: Entlassen-Button immer aktiv.
- **TA-YTH-22**: Bestaetigungsdialoge vor Befoerderung und Entlassung.

### Tests

- Training-Effekte auf Level, Moral und Fitness
- Befoerderungs-Altersbeschraenkung (>= 16)
- Team-Eigentuemerpruefung bei Befoerderung/Entlassung
- Automatische Entlassung ab 19
- Talent ist nicht im API-Response enthalten
