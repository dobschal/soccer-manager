# Jugendakademie (Youth Academy)

## Beschreibung

Die Jugendakademie ist ein Gebäude, das die Wahrscheinlichkeit erhöht, Jugendspieler-Aktionskarten zu erhalten. Höhere Akademie-Level schalten stärkere Karten frei (höheres Anfangs-Level und Talent). Wenn der Nutzer eine Jugendspieler-Karte einsetzt, kann er aus drei zufällig generierten Spielern auswählen.

## User Stories

- **US-YA-01**: Als Spieler sehe ich die Jugendakademie auf der Gebäude-Seite mit aktuellem Level und Effekt-Beschreibung.
- **US-YA-02**: Als Spieler kann ich meine Jugendakademie für 3 Mio. / 9 Mio. Euro auf Level 2 / 3 ausbauen. Jedes Team startet mit Level 1.
- **US-YA-03**: Als Spieler erhalte ich abhängig vom Akademie-Level Jugendspieler-Karten in unterschiedlicher Stufe (Bronze / Silber / Gold für Level 1 / 2 / 3), maximal 3 pro Saison.
- **US-YA-04**: Als Spieler kann ich beim Einsetzen einer Jugendspieler-Karte aus 3 generierten Optionen (Name, Position, Alter, Level, Bild) auswählen.

## Gebaeudetypen

Jedes Akademie-Level liefert **ausschliesslich seine eigene Kartenstufe** — ein Level-3-Team
erhaelt also keine Bronze-Karten mehr, sondern nur noch Gold. So entspricht die im Gebäude
beworbene Level-Range genau dem, was man bekommt.

| Level | Kosten | Bauzeit | Karte | Chance/Spieltag | ~pro Saison |
|---|---|---|---|---|---|
| 1 (Basis, Startlevel) | – | – | NEW_YOUTH_PLAYER_1 | 0,06 | ~2 |
| 2 (Fortgeschritten) | 3.000.000 € | 10 Spieltage | NEW_YOUTH_PLAYER_2 | 0,09 | ~3 |
| 3 (Elite) | 9.000.000 € | 17 Spieltage | NEW_YOUTH_PLAYER_3 | 0,12 | ~4 (siehe Hinweis) |

> ⚠️ **Offener Balancing-Punkt**: `MAX_YOUTH_CARDS_PER_SEASON = 3` kappt die Ausgabe bei 3 Karten
> pro Saison. Der rechnerische Erwartungswert von Level 3 (0,12 × 34 ≈ 4,1) wird dadurch nie
> erreicht — Level 2 und Level 3 liefern effektiv gleich **viele** Karten und unterscheiden sich
> nur in der Stufe. Ob der Deckel fuer Level 3 angehoben werden soll, ist noch nicht entschieden.

## Karten-Typen

| Kartentyp | Level-Range | Talent-Range |
|---|---|---|
| NEW_YOUTH_PLAYER_1 | 1.0 - 5.0 | 0.1 - 0.5 |
| NEW_YOUTH_PLAYER_2 | 5.0 - 10.0 | 0.3 - 0.75 |
| NEW_YOUTH_PLAYER_3 | 10.0 - 15.0 | 0.5 - 1.0 |

Pro Spieltag werden die Karten-Chancen aus `YOUTH_ACADEMY_CARD_CHANCES[level]` mit dem Standard-Verteilungsalgorithmus (`floor` + `Math.random` < remainder) verarbeitet.

## Auswahl der Jugendspieler

Beim Aufdecken einer NEW_YOUTH_PLAYER_X-Karte ruft das Frontend `getYouthPlayerOptions(cardId)` ab und zeigt drei zufällig generierte Spieler (Name, Position, Alter 15, Level, Bild) in einem Overlay. Beim Klick auf einen Spieler ruft das Frontend `useActionCard(card, selectedOption, null)` auf. Der Server validiert die Werte (Level und Talent werden auf die Karten-Range geklemmt) und legt den Jugendspieler über `createYouthPlayer(teamId, season, overrides)` an.

## Technische Anforderungen

### Datenbank

- **TA-YA-01**: Neue Gebäude-Zeile pro Team in `building` mit `type='youth_academy'` und `level=1` als Default.
- **TA-YA-02**: Migration: alle bestehenden Teams erhalten eine Zeile `youth_academy` Level 1 (bestehende Level-0-Einträge werden auf Level 1 hochgesetzt). Neue Teams (`createTeam`, `regenerateTeamData`) erhalten ebenfalls eine Zeile.

### Backend

- **TA-YA-03**: `BUILDING_UPGRADES.youth_academy_{2,3}` mit Kosten und Bauzeit (kein `_1`, weil Teams bereits mit Level 1 starten).
- **TA-YA-04**: `YOUTH_ACADEMY_CARD_CHANCES[1..3]` analog zu Trainingsgelände und Fitness-Studio (Level 0 existiert nicht).
- **TA-YA-05**: `getYouthAcademyLevel(teamId)` und `getAllYouthAcademyLevels()` für Single- bzw. Batch-Lookup.
- **TA-YA-06**: `_giveUsersActionCards()` überschreibt die Karten-Chancen für NEW_YOUTH_PLAYER_X mit Akademie-Level-Overrides.
- **TA-YA-07**: Garantierte Karte: Wenn ein Team weder einen Jugendspieler besitzt noch in dieser Saison eine Jugendspieler-Karte erhalten hat, wird eine Pending-Karte vergeben. Die Stufe kommt aus `YOUTH_ACADEMY_GUARANTEED_CARD[akademieLevel]` (1 → Bronze, 2 → Silber, 3 → Gold) und muss zur von `YOUTH_ACADEMY_CARD_CHANCES` ausgegebenen Stufe passen.
- **TA-YA-14**: Deckel: `MAX_YOUTH_CARDS_PER_SEASON = 3` Jugendkarten pro Team und Saison. Die Garantiekarte zaehlt mit. Ist der Deckel erreicht, werden fuer den Rest der Saison keine weiteren Jugendkarten mehr vergeben.
- **TA-YA-15**: Trainingsmodus-Slots skalieren mit dem Akademie-Level: `rest` immer 4, `training` und `friendly_match` je `max(2, min(4, level + 1))` (siehe [Youth Players](youth-players.md)).
- **TA-YA-08**: `YOUTH_PLAYER_CARD_RANGES` definiert Level- und Talent-Ranges pro Karte; `generateYouthPlayerOptions(action)` liefert 3 Optionen innerhalb dieser Ranges.
- **TA-YA-09**: Beim Einsetzen einer NEW_YOUTH_PLAYER_X-Karte validiert der Server die übergebene Option (Name nicht leer, Position aus `Position`-Enum, Level/Talent in Range, hair/skin_color in gültigem Bereich) und erstellt den Jugendspieler mit den validierten Werten.

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getBuildings` | Liefert nun zusätzlich `youthAcademyCardChances` zurück |
| `upgradeBuilding('youth_academy')` | Startet ein Akademie-Upgrade |
| `getYouthPlayerOptions(cardId)` | Liefert 3 Jugendspieler-Optionen für eine NEW_YOUTH_PLAYER_X-Karte |
| `useActionCard(card, selectedOption, null)` | Setzt eine NEW_YOUTH_PLAYER_X-Karte mit der ausgewählten Option ein |

### Frontend

- **TA-YA-10**: Buildings-Page rendert eine dritte Gebäude-Karte „Jugendakademie". Es wird immer `assets/youth-academy/youth-academy-level-{1,2,3}.png` angezeigt (jedes Team startet mit Level 1).
- **TA-YA-11**: _Entfernt._ Es gibt kein Level 0 mehr – der Upgrade-Button trägt immer die Standard-Beschriftung „Upgrade auf Level X".
- **TA-YA-12**: Action-Card SVGs unter `assets/action-cards/new-youth-player-{1,2,3}.svg` mit eigenen i18n-Titeln und Footern.
- **TA-YA-13**: Beim Aufdecken einer NEW_YOUTH_PLAYER_X-Karte öffnet sich ein Overlay mit drei Spieler-Karten (Bild, Name, Position, Alter, Level). Klick auf eine Karte schliesst das Overlay und ruft `useActionCard` auf.

### Tests

- Karten-Wahrscheinlichkeiten je Akademie-Level: jedes Level gibt nur seine eigene Stufe aus
- Deckel von 3 Jugendkarten pro Saison greift, Garantiekarte zaehlt mit
- Garantiekarte hat die zum Akademie-Level passende Stufe
- Baukosten und Bauzeit-Validierung für `youth_academy_{2,3}`
- `generateYouthPlayerOptions` liefert 3 Optionen innerhalb der Karten-Range
- `playActionCard` für NEW_YOUTH_PLAYER_X klemmt Level/Talent auf die Karten-Range (Anti-Cheat)
- Guarantee-Mechanismus vergibt eine NEW_YOUTH_PLAYER_1, wenn weder Jugendspieler noch Jugend-Karte vorhanden sind
