# Spieler-Verletzungen (Player Injuries)

## Beschreibung

Das Verletzungssystem ist aktuell **nicht implementiert**. Es existiert lediglich ein i18n-Schlüssel (`log.playerInjured`) als Vorbereitung für eine zukünftige Implementierung. Stattdessen gibt es das Spieler-Sperren-System basierend auf Karten-Akkumulation.

## Status: Geplant (nicht umgesetzt)

## Geplante User Stories

- **US-INJ-01**: Als Spieler können sich meine Spieler während eines Spiels verletzen, basierend auf einer Wahrscheinlichkeitsberechnung.
- **US-INJ-02**: Als Spieler sehe ich, welche Spieler verletzt sind und wie viele Spieltage sie ausfallen.
- **US-INJ-03**: Als Spieler werden verletzte Spieler automatisch aus der Aufstellung entfernt.
- **US-INJ-04**: Als Spieler erhalte ich eine Log-Nachricht, wenn ein Spieler verletzt wird.

## Geplante technische Anforderungen

### Datenbank-Erweiterungen

- **TA-INJ-01**: Neue Spalten in `player`-Tabelle: `is_injured` (TINYINT), `injury_type` (VARCHAR), `injury_end_game_day` (INT), `injury_end_season` (INT).
- **TA-INJ-02**: Verletzungsdauer: variabel je nach Verletzungstyp (1-20 Spieltage).

### Verletzungsmechanik

- **TA-INJ-03**: Verletzungswahrscheinlichkeit während Spielen (z.B. bei Kämpfen um den Ball).
- **TA-INJ-04**: Mögliche Verletzungstypen: Muskelzerrung, Bänderriss, Prellung, etc.
- **TA-INJ-05**: Schweregrad beeinflusst Ausfalldauer.
- **TA-INJ-06**: Erholung über die Zeit (automatisch bei Erreichen des Enddatums).

### Vorhandene Infrastruktur

- **TA-INJ-07**: i18n-Schlüssel existiert: `log.playerInjured: '{playerName} is injured and will miss the next game.'`
- **TA-INJ-08**: Das Sperren-System (`is_suspended`) kann als Vorlage für die Implementierung dienen.

## Aktuell implementiert: Spieler-Sperren

Siehe [player-suspension.md](./player-suspension.md) für das aktuelle System, das Spieler basierend auf Karten-Akkumulation sperrt.
