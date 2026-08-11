# Spieler-Gehalt (Player Salary)

## Beschreibung

Jeder Spieler erhaelt ein Gehalt basierend auf seinem Level, das automatisch nach jedem Spieltag vom Team-Budget abgezogen wird. Die exponentielle Gehaltskurve sorgt dafuer, dass hochlevelige Spieler deutlich teurer sind.

## User Stories

- **US-SAL-01**: Als Spieler sehe ich das Gehalt jedes einzelnen Spielers in der Spielerliste und im Spieler-Modal.
- **US-SAL-02**: Als Spieler sehe ich die Gesamtgehaltskosten meines Teams auf der Team-Seite.
- **US-SAL-03**: Als Spieler werden die Gehaelter automatisch nach jedem Spieltag von meinem Budget abgezogen.
- **US-SAL-04**: Als Spieler sehe ich Gehaltszahlungen in meiner Finanzuebersicht.
- **US-SAL-05**: Als Spieler wird mir das geschaetzte Gehalt angezeigt, bevor ich einen freien Spieler verpflichte.

## Gehaltsformel

Zwei exponentielle Abschnitte mit einem Knick bei Level 50 (#543):

```
level <= 50:  getSalary(level) = floor(150  * (1217 / 150)   ^ ((level - 1)  / 49))
level >  50:  getSalary(level) = floor(1217 * (50000 / 1217) ^ ((level - 50) / 50))
```

### Gehaltstabelle (Beispiele)

| Level | Gehalt pro Spieltag | vorher |
|---|---|---|
| 1 | 150 Euro | 150 Euro |
| 10 | 220 Euro | 220 Euro |
| 20 | 337 Euro | 337 Euro |
| 30 | 517 Euro | 517 Euro |
| 40 | 793 Euro | 793 Euro |
| 50 | 1.217 Euro | 1.217 Euro |
| 60 | 2.558 Euro | 1.867 Euro |
| 70 | 5.379 Euro | 2.865 Euro |
| 80 | 11.310 Euro | 4.385 Euro |
| 90 | 23.781 Euro | 6.727 Euro |
| 100 | 50.000 Euro | 10.308 Euro |

- Fuer Level <= 0 wird 0 zurueckgegeben.
- Unterhalb des Knicks ist die Kurve **identisch zur vorherigen** — kleine Vereine
  zahlen exakt so viel wie bisher.
- Oberhalb des Knicks verdoppelt sie sich etwa alle 9 Level.

### Warum der Knick (#543)

Die Prod-Auswertung zum Zeitpunkt der Aenderung zeigte, dass Gehaelter die Spitze kaum
belasten, die unteren Ligen dagegen stark:

| Liga-Level | Einkommen/Spieltag | Gehaelter/Spieltag | Anteil |
|---|---|---|---|
| 0 | ~1.980.000 Euro | ~53.000 Euro | 2,7% |
| 1 | ~917.000 Euro | ~30.000 Euro | 3,3% |
| 2 | ~124.000 Euro | ~15.000 Euro | 11,8% |
| 3 | ~29.000 Euro | ~10.000 Euro | 33,4% |

Ein blosses Anheben des Kurvenendes haette Liga 3 auf ~52% des Einkommens getrieben —
also genau die Vereine getroffen, denen das Ticket helfen soll. Mit dem Knick bei
Level 50 steigt Liga 0 auf ~5,3%, Liga 3 bleibt praktisch unveraendert.

## Technische Anforderungen

### Gehaltsberechnung

- **TA-SAL-01**: Die Funktion `getSalary(level)` ist in `client/util/player.js` implementiert und wird Client- und Server-seitig identisch verwendet.
- **TA-SAL-02**: Zwei exponentielle Abschnitte, verbunden bei `SALARY_KNEE_LEVEL` (50):
  150 → 1.217 (Level 1-50, unveraendert) und 1.217 → 50.000 (Level 50-100).
  Die Stuetzstellen stehen als `SALARY_AT_LEVEL_1`, `SALARY_AT_KNEE` und
  `SALARY_AT_LEVEL_100` in `client/util/player.js`.

### Gehaltszahlung

- **TA-SAL-03**: Gehaelter werden in `_letTeamsPaySallaries()` nach jedem Spieltag abgezogen.
- **TA-SAL-04**: Berechnung: `totalSallaryCosts = players.reduce((total, player) => total + getSalary(player.level), 0) * -1`.
- **TA-SAL-05**: Zahlungsfrequenz: 34 Mal pro Saison (einmal pro Spieltag).
- **TA-SAL-06**: Atomare Transaktion: Balance-Update und Finance-Log-Eintrag erfolgen zusammen.

### Datenbank

- **TA-SAL-07**: Gehaltszahlungen werden in `finance_log` gespeichert mit Grund "Player salaries" (lokalisiert).
- **TA-SAL-08**: Gehaelter werden nicht direkt in der `player`-Tabelle gespeichert, sondern dynamisch aus dem Level berechnet.

### Finanzielle Balance

- **TA-SAL-09**: Bot-Team-Stadioneinnahmen decken die Gehaltskosten fuer Liga-Level 0-5.
- **TA-SAL-10**: Saisonkosten-Formel: `anzahlSpieler * getSalary(durchschnittLevel) * 34`.

### Frontend-Anzeige

- **TA-SAL-11**: Spielerliste: Individuelles Gehalt pro Spieler, rechtsbuendig.
- **TA-SAL-12**: Team-Info-Karte: Gesamtgehalt als Summe aller Spieler.
- **TA-SAL-13**: Spieler-Modal: Gehalt im Kompaktformat (z.B. "3,5K Euro").
- **TA-SAL-14**: Verpflichtungs-Dialog: Geschaetztes Gehalt vor Vertragsunterschrift.
- **TA-SAL-15**: Finanzseite: Alle Gehaltszahlungen in der Transaktionsliste.

### WebSocket

- **TA-SAL-16**: Nach jeder Gehaltszahlung wird ein `BALANCE_UPDATED`-Event via WebSocket an den Client gesendet.

### Tests

- Gehaltsformel-Validierung (Stuetzstellen 150 / 1.217 / 50.000, Monotonie, kein Sprung am Knick)
- Unveraenderte Werte unterhalb des Knicks (Level 10/20/30/40)
- Bot-Team-Finanzbalance (Stadioneinnahmen >= Gehaltskosten)
- Finanzlog-Eintraege mit korrekten negativen Werten
