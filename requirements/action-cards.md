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

## Kartentypen

| Kartentyp | Effekt | Max. Level-Cap | Zusammenfuehrbar |
|---|---|---|---|
| LEVEL_UP_PLAYER_40 | +1 Level | 40 | Ja (2x -> 1x LEVEL_UP_PLAYER_70) |
| LEVEL_UP_PLAYER_70 | +1 Level | 70 | Ja (2x -> 1x LEVEL_UP_PLAYER_100) |
| LEVEL_UP_PLAYER_100 | +1 Level | 100 | Nein |
| FRESHNESS_5 | +5% Frische | - | Nein |
| FRESHNESS_10 | +10% Frische | - | Nein |
| FRESHNESS_20 | +20% Frische | - | Nein |
| NEW_YOUTH_PLAYER | Neuer Jugendspieler | - | Nein |
| BONUS_100K | +100.000 Euro | - | Nein |
| STAR_PLAYER | Permanenter +10% Bonus | - | Nein |
| MOTIVATING_SPEECH | Team-weiter +10% Bonus (1 Spieltag) | - | Nein |

## Karten-Verteilung (pro Spieltag)

| Kartentyp | Basis-Wahrscheinlichkeit |
|---|---|
| LEVEL_UP_PLAYER_40 | 1.2 |
| LEVEL_UP_PLAYER_70 | 0.3 |
| LEVEL_UP_PLAYER_100 | 0.06 |
| FRESHNESS_10 | 0.88 |
| NEW_YOUTH_PLAYER | 0.05 |
| BONUS_100K | 0.06 |
| STAR_PLAYER | 0.01 |
| MOTIVATING_SPEECH | 0.05 |

Die Wahrscheinlichkeiten werden durch Gebaeude-Level modifiziert (Trainingsgelaende und Fitness-Studio).

## Technische Anforderungen

### Backend

- **TA-AC-01**: Aktionskarten werden in der Tabelle `action_card` gespeichert mit den Feldern: `id`, `team_id`, `action`, `played`, `state`, `created_at`.
- **TA-AC-02**: Karten durchlaufen den Lebenszyklus: `pending` -> `received` -> `played`.
- **TA-AC-03**: Die Verteilung erfolgt in `_giveUsersActionCards()` nach jedem Spieltag.
- **TA-AC-04**: Gebaeude-Modifikatoren (Trainingsgelaende, Fitness-Studio) ueberschreiben die Basis-Wahrscheinlichkeiten.
- **TA-AC-05**: Maximal 20 Level-Ups pro Saison pro Spieler.
- **TA-AC-06**: Frische wird auf maximal 1.0 begrenzt.

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getActionCards` | Gibt alle Karten im Status `received` zurueck |
| `getPendingActionCards` | Gibt noch nicht aufgedeckte Karten zurueck |
| `claimActionCard(cardId)` | Deckt eine Karte auf (pending -> received) |
| `useActionCard(card, player, position)` | Setzt eine Karte ein |
| `mergeCards(card1, card2)` | Fuehrt zwei gleichartige Karten zusammen |

### Frontend

- **TA-AC-08**: Karten werden als gestapelte Karten-Grafiken angezeigt (max. 5 sichtbar pro Stack).
- **TA-AC-09**: Aufdecken neuer Karten mit 3D-Flip-Animation.
- **TA-AC-10**: Merge-Animation: Beide Karten faden aus, neue hoeherwertige Karte erscheint.
- **TA-AC-11**: Merge-Badge (rot) wird angezeigt, wenn eine Zusammenfuehrung moeglich ist.
- **TA-AC-12**: Karten-Bilder liegen als SVG unter `assets/action-cards/`.

### Tests

- Unit-Tests fuer alle Karteneffekte und Level-Caps
- Tests fuer Merge-Validierung (verschiedene Typen, nicht-zusammenfuehrbare Karten)
- Verteilungswahrscheinlichkeits-Tests (Simulation ueber 10.000 Spieltage)
- Tests fuer Gebaeude-Modifikatoren
