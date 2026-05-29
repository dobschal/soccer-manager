# Jugendakademie (Youth Academy)

## Beschreibung

Die Jugendakademie ist ein Gebäude, das die Wahrscheinlichkeit erhöht, Jugendspieler-Aktionskarten zu erhalten. Höhere Akademie-Level schalten stärkere Karten frei (höheres Anfangs-Level und Talent). Wenn der Nutzer eine Jugendspieler-Karte einsetzt, kann er aus drei zufällig generierten Spielern auswählen.

## User Stories

- **US-YA-01**: Als Spieler sehe ich die Jugendakademie auf der Gebäude-Seite mit aktuellem Level und Effekt-Beschreibung.
- **US-YA-02**: Als Spieler kann ich meine Jugendakademie für 1 Mio. / 3 Mio. / 9 Mio. Euro auf Level 1 / 2 / 3 ausbauen.
- **US-YA-03**: Als Spieler erhalte ich abhängig vom Akademie-Level unterschiedlich viele Jugendspieler-Karten pro Saison (~1 / 2 / 3 / 4 für Level 0 / 1 / 2 / 3).
- **US-YA-04**: Als Spieler kann ich beim Einsetzen einer Jugendspieler-Karte aus 3 generierten Optionen (Name, Position, Alter, Level, Bild) auswählen.

## Gebaeudetypen

| Level | Kosten | Bauzeit | Kartenmix pro Saison |
|---|---|---|---|
| 0 (kein Gebaeude) | – | – | ~1x NEW_YOUTH_PLAYER_1 |
| 1 (Basis) | 1.000.000 € | 5 Spieltage | ~2x NEW_YOUTH_PLAYER_1 |
| 2 (Fortgeschritten) | 3.000.000 € | 10 Spieltage | ~2x NEW_YOUTH_PLAYER_1 + ~1x NEW_YOUTH_PLAYER_2 |
| 3 (Elite) | 9.000.000 € | 17 Spieltage | ~2x NEW_YOUTH_PLAYER_1 + ~1x NEW_YOUTH_PLAYER_2 + ~1x NEW_YOUTH_PLAYER_3 |

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

- **TA-YA-01**: Neue Gebäude-Zeile pro Team in `building` mit `type='youth_academy'` und `level=0` als Default.
- **TA-YA-02**: Migration: alle bestehenden Teams erhalten eine Zeile `youth_academy` Level 0. Neue Teams (`createTeam`, `regenerateTeamData`) erhalten ebenfalls eine Zeile.

### Backend

- **TA-YA-03**: `BUILDING_UPGRADES.youth_academy_{1,2,3}` mit Kosten und Bauzeit.
- **TA-YA-04**: `YOUTH_ACADEMY_CARD_CHANCES[0..3]` analog zu Trainingsgelände und Fitness-Studio.
- **TA-YA-05**: `getYouthAcademyLevel(teamId)` und `getAllYouthAcademyLevels()` für Single- bzw. Batch-Lookup.
- **TA-YA-06**: `_giveUsersActionCards()` überschreibt die Karten-Chancen für NEW_YOUTH_PLAYER_X mit Akademie-Level-Overrides.
- **TA-YA-07**: Garantierte Karte: Wenn ein Team weder einen Jugendspieler besitzt noch in dieser Saison eine Jugendspieler-Karte (NEW_YOUTH_PLAYER oder NEW_YOUTH_PLAYER_X) erhalten hat, wird eine NEW_YOUTH_PLAYER_1 als Pending-Karte vergeben.
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

- **TA-YA-10**: Buildings-Page rendert eine dritte Gebäude-Karte „Jugendakademie". Level 0 zeigt keine Grafik; ab Level 1 wird `assets/youth-academy/youth-academy-level-{1,2,3}.png` angezeigt.
- **TA-YA-11**: Bei Level 0 trägt der Upgrade-Button die Beschriftung „Jugendakademie bauen" statt „Upgrade auf Level 1".
- **TA-YA-12**: Action-Card SVGs unter `assets/action-cards/new-youth-player-{1,2,3}.svg` mit eigenen i18n-Titeln und Footern.
- **TA-YA-13**: Beim Aufdecken einer NEW_YOUTH_PLAYER_X-Karte öffnet sich ein Overlay mit drei Spieler-Karten (Bild, Name, Position, Alter, Level). Klick auf eine Karte schliesst das Overlay und ruft `useActionCard` auf.

### Tests

- Karten-Wahrscheinlichkeiten je Akademie-Level (Summe pro Saison ~1/2/3/4)
- Baukosten und Bauzeit-Validierung für `youth_academy_{1,2,3}`
- `generateYouthPlayerOptions` liefert 3 Optionen innerhalb der Karten-Range
- `playActionCard` für NEW_YOUTH_PLAYER_X klemmt Level/Talent auf die Karten-Range (Anti-Cheat)
- Guarantee-Mechanismus vergibt eine NEW_YOUTH_PLAYER_1, wenn weder Jugendspieler noch Jugend-Karte vorhanden sind
