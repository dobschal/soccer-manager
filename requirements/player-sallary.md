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

```
getSalary(level) = Math.floor(150 * Math.pow(10308 / 150, (level - 1) / 99))
```

### Gehaltstabelle (Beispiele)

| Level | Gehalt pro Spieltag |
|---|---|
| 1 | 150 Euro |
| 10 | ~245 Euro |
| 20 | ~400 Euro |
| 30 | ~655 Euro |
| 40 | ~1.070 Euro |
| 50 | ~1.748 Euro |
| 60 | ~2.855 Euro |
| 70 | ~4.668 Euro |
| 80 | ~7.630 Euro |
| 100 | 10.308 Euro |

- Fuer Level <= 0 wird 0 zurueckgegeben.
- Die Kurve verdoppelt sich ungefaehr alle 10 Level.

## Technische Anforderungen

### Gehaltsberechnung

- **TA-SAL-01**: Die Funktion `getSalary(level)` ist in `client/util/player.js` implementiert und wird Client- und Server-seitig identisch verwendet.
- **TA-SAL-02**: Exponentielle Wachstumskurve von 150 (Level 1) bis 10.308 (Level 100).

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

- Gehaltsformel-Validierung (Level 1 = 150, Level 100 = 10.308)
- Bot-Team-Finanzbalance (Stadioneinnahmen >= Gehaltskosten)
- Finanzlog-Eintraege mit korrekten negativen Werten
