# Team-Taktik

## Beschreibung

Jedes Team hat drei taktische Einstellungen: Angriffsmodus (Passrichtung), Spielstil (Aggressivitaet) und Passstil (Passlaenge). Diese beeinflussen direkt die Spielsimulation.

## User Stories

- **US-TAC-01**: Als Spieler kann ich einen Angriffsmodus waehlen, der die Passrichtung meines Teams steuert.
- **US-TAC-02**: Als Spieler kann ich einen Spielstil waehlen, der die Kampfstaerke und Kartenwahrscheinlichkeit beeinflusst.
- **US-TAC-03**: Als Spieler kann ich einen Passstil waehlen, der die Passlaenge steuert.
- **US-TAC-04**: Als Spieler sehe ich Tooltips/Beschreibungen fuer jede taktische Option.
- **US-TAC-05**: Als Spieler sehe ich die Auswirkungen meiner Taktik in den Spielstatistiken.

## Taktische Optionen

### Angriffsmodus

| Modus | Vorwaertspaesse | Abfang-Basiswahrscheinlichkeit |
|---|---|---|
| Offensiv | 85% | 6% |
| Balanciert | 50% | 3% |
| Defensiv | 20% | 1% |

Abfangwahrscheinlichkeit skaliert mit Spieler-Level: `basis * (1 - level / 150)`.

### Spielstil

| Stil | Kampf-Bonus | Karten-Wahrscheinlichkeit/Kampf | Fitness-Verlust |
|---|---|---|---|
| Aggressiv | +15% | 0,8% | 12% |
| Normal | 0% | 0,65% | 10% |
| Freundlich | -15% | 0,55% | 8% |

### Passstil

| Stil | Beschreibung |
|---|---|
| Kurz | Nur Paesse an nahe Mitspieler |
| Gemischt | 50% kurze, 50% lange Paesse |
| Lang | Primaer Paesse an entfernte Mitspieler |

## Technische Anforderungen

### Spielsimulations-Auswirkungen

- **TA-TAC-01**: Angriffsmodus beeinflusst Passrichtung via `ATTACK_MODE_MODIFIERS.forwardBias`.
- **TA-TAC-02**: Nur Vorwaertspaesse koennen abgefangen werden (y-Koordinate des Empfaengers > Passgebers).
- **TA-TAC-03**: Spielstil beeinflusst effektives Level bei Kaempfen: `level * (1 + fightBonus)`.
- **TA-TAC-04**: Kartenwahrscheinlichkeit pro Kampf abhaengig vom Spielstil beider Teams.
- **TA-TAC-05**: Torwart-Fitness-Verlust immer 8% unabhaengig vom Spielstil.

### Karten-Regeln

- **TA-TAC-06**: Gelbe Karten akkumulieren ueber die Saison (5 = Sperre).
- **TA-TAC-07**: 2. Gelbe im selben Spiel = automatische Rote Karte und Platzverweis.
- **TA-TAC-08**: Direkte Rote: 0,002% bei aggressivem Spielstil.
- **TA-TAC-09**: Vorsichtsfaktor: 17% der normalen Wahrscheinlichkeit nach 1. Gelber im Spiel.

### Datenbank

- **TA-TAC-10**: `team.attack_mode` (VARCHAR(20), Standard: 'balanced').
- **TA-TAC-11**: `team.play_style` (VARCHAR(20), Standard: 'normal').
- **TA-TAC-12**: `team.pass_style` (VARCHAR(10), Standard: 'mixed').

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `updateAttackMode(attackMode)` | Angriffsmodus aendern (offensive/balanced/defensive) |
| `updatePlayStyle(playStyle)` | Spielstil aendern (aggressive/normal/friendly) |
| `updatePassStyle(passStyle)` | Passstil aendern (short/mixed/long) |

### Frontend

- **TA-TAC-13**: Drei Dropdown-Selects auf der My-Team-Seite (Taktik-Karte).
- **TA-TAC-14**: Sofortiges Feedback via Toast-Benachrichtigung bei Aenderung.
- **TA-TAC-15**: Tooltip-Beschreibungen fuer jede Option (`title`-Attribut).

### i18n

- **TA-TAC-16**: Uebersetzungs-Keys fuer alle Modi, Stile und Beschreibungen (EN/DE).

### Tests

- Spielstil-Modifikatoren Validierung (Aggressiv > Normal > Freundlich fuer Karten)
- Kampf-Bonus-Auswirkung auf Gewinnwahrscheinlichkeit
- Karten-Statistiken pro Spielstil gegen Bundesliga-Zielwerte
- API-Validierung (ungueltige Werte ablehnen)
