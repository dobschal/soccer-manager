# Bot-Teams (KI-gesteuerte Teams)

## Beschreibung

Bot-Teams sind KI-gesteuerte Mannschaften, die die Liga fuellen und als Gegner fuer menschliche Spieler dienen. Sie treffen automatisch Entscheidungen zu Aufstellungen, Transfers, Sponsoren und Stadionerweiterungen.

## User Stories

- **US-BOT-01**: Als neuer Spieler kann ich mir ein bestehendes Bot-Team aussuchen und uebernehmen, damit ich sofort mit einer vollstaendigen Mannschaft starte (siehe [User Registration](user-registration.md)).
- **US-BOT-02**: Als Spieler spiele ich gegen Bot-Teams in der Liga, die realistische Entscheidungen treffen und als Gegner eine Herausforderung darstellen.
- **US-BOT-03**: Als Spieler kann ich Spieler von Bot-Teams kaufen und an Bot-Teams verkaufen, wobei Bots Angebote automatisch bewerten.
- **US-BOT-04**: Als Spieler bekomme ich die Antwort eines Bot-Teams auf mein Kaufangebot nicht sofort, sondern
  innerhalb von 24 Stunden, damit sich ein Bot wie ein Manager verhaelt und nicht wie ein Automat
  (Details: [Player Transfers](player-transfers.md), TA-TRF-28).
- **US-BOT-05**: Als Spieler kann ich einem Bot-Team keinen Spieler in dessen letzter Saison verkaufen
  (TA-TRF-29).

## Technische Anforderungen

### Bot-Erstellung

- **TA-BOT-01**: Bot-Teams werden waehrend der Saisonvorbereitung (`prepareSeason`) erstellt, um mindestens 18 Teams pro Liga zu haben.
- **TA-BOT-02**: Bot-Teams haben `user_id = NULL` und `is_system_team = 0`.
- **TA-BOT-03**: Jedes Bot-Team erhaelt einen zufaellig generierten Namen aus `clubPrefixes1` + `clubPrefixes2` + `cityNames`.
- **TA-BOT-04**: Bot-Teams starten mit 100.000 Euro Balance (Spieler starten mit 500.000 Euro).
- **TA-BOT-05**: Jedes Bot-Team erhaelt 18 Spieler (einen pro Formation-Position), ein zufaelliges Emblem und 3 Gebaeude (Trainingsgelaende, Fitness-Studio und Jugendakademie, jeweils Level 1).

### Spieler-Level-Skalierung nach Liga-Level

| Liga-Level | Min. Spieler-Level | Max. Spieler-Level |
|---|---|---|
| 0 (1. Liga) | 40 | 60 |
| 1 (2. Liga) | 30 | 50 |
| 2 (3. Liga) | 20 | 40 |
| 3 (4. Liga) | 10 | 30 |
| 4+ | max(1, 50-level*10) | max(10, 70-level*10) |

### Stadion-Skalierung nach Liga-Level

| Liga-Level | Nord | Sued | Ost | West | Gesamt |
|---|---|---|---|---|---|
| 0 | 2.600 | 1.300 | 650 | 650 | 5.200 |
| 1 | 1.700 | 850 | 425 | 425 | 3.400 |
| 2 | 1.200 | 600 | 300 | 300 | 2.400 |
| 3-4 | 750 | 375 | 188 | 187 | 1.500 |
| 5 | 500 | 250 | 125 | 125 | 1.000 |
| 6 | 200 | 200 | 122 | 122 | 644 |
| 7+ | 200 | 100 | 100 | 100 | 500 |

### Bot-Entscheidungen (alle 12 Stunden via CRON)

- **TA-BOT-06**: `_checkTactic()` - Optimiert die Aufstellung basierend auf Frische und Level der Spieler.
- **TA-BOT-07**: `_checkActionCards()` - Nutzt gesammelte Aktionskarten automatisch (Merge vor Einsatz).
- **TA-BOT-08**: `_chooseSponsor()` - Waehlt einen zufaelligen Sponsor, wenn keiner aktiv ist.
- **TA-BOT-09**: `_checkStadium()` - Erweitert das Stadion mit 10% Wahrscheinlichkeit pro Spieltag.
- **TA-BOT-10**: `_checkTrades()` - Verwaltet den Spielermarkt (5-Schritte-Prozess):
  1. Alte Angebote aufraeumen (>48h Kauf-/Verkaufsangebote loeschen)
  2. Ueberzaehlige Spieler entlassen (>25 Spieler)
  3. Eingehende Kaufangebote bewerten und annehmen/ablehnen
  4. Freie Spieler verpflichten (priorisiert nach Formation-Bedarf)
  5. Verkaufs- und Kaufangebote erstellen

### Bot-Transfer-Logik

- **TA-BOT-11**: Kaufangebote werden bewertet basierend auf:
  - Position in der Formation (kritisch: 1.5-2x Preisaufschlag)
  - Verfuegbare Ersatzspieler (einziger Spieler auf Position: immer ablehnen)
  - Zufallsfaktor (+-20% Varianz)
- **TA-BOT-12**: Kaufangebote werden priorisiert nach: Kritisch (fehlende Position, +1000), Frische-Bedarf (+800), Kadertiefe (+600), Upgrade (+400), Gelegenheit (+200).
- **TA-BOT-13**: Maximal 80% des Team-Budgets fuer Spielerkaeufe.
- **TA-BOT-14**: Bot-Teams erhalten im Spiel einen -10% Level-Malus.

### Inaktive Spieler

- **TA-BOT-15**: Spieler, die sich 21+ Tage nicht eingeloggt haben, werden automatisch zu Bot-Teams konvertiert (`cleanupInactiveUsers`).

### Tests

- Trading-Logik (Angebots-Annahme/-Ablehnung)
- Formations-Schutz (keine kritischen Positionen verkaufen)
- Freie-Spieler-Verpflichtung
- Level-Bereiche und Stadion-Konfiguration pro Liga-Level
