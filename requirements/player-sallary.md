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

Eine einzige Exponentialkurve von 72 Euro (Level 1) bis 18.500 Euro (Level 100):

```
getSalary(level) = floor(72 * (18500 / 72) ^ ((level - 1) / 99))
```

### Gehaltstabelle (Beispiele)

| Level | Gehalt pro Spieltag | vorher |
|---|---|---|
| 1 | 72 Euro | 150 Euro |
| 10 | 119 Euro | 220 Euro |
| 20 | 208 Euro | 337 Euro |
| 30 | 365 Euro | 517 Euro |
| 40 | 640 Euro | 793 Euro |
| 50 | 1.122 Euro | 1.217 Euro |
| 60 | 1.965 Euro | 1.866 Euro |
| 70 | 3.442 Euro | 2.860 Euro |
| 80 | 6.030 Euro | 4.385 Euro |
| 90 | 10.562 Euro | 6.723 Euro |
| 100 | 18.500 Euro | 10.308 Euro |

- Fuer Level <= 0 wird 0 zurueckgegeben.
- Die Form ist dieselbe wie zuvor, nur staerker geneigt: die Kurve kreuzt die alte
  bei etwa Level 56. Darunter sind Spieler guenstiger, darueber teurer.

### Kalibrierung (#543)

Der Anker des Wirtschaftssystems ist: **die Sponsoreinnahmen decken ungefaehr die
Gehaelter**. An echten Kaderdaten gemessen sah das vorher so aus — und so danach:

| Liga | Sponsor/Spieltag | Gehalt alt | Deckung alt | Gehalt neu | Deckung neu |
|---|---|---|---|---|---|
| 0 | 55.291 Euro | 52.414 Euro | 1,05 | 62.900 Euro (x1,20) | 0,88 |
| 1 | 39.621 Euro | 30.236 Euro | 1,31 | 30.500 Euro (x1,01) | 1,30 |
| 2 | 24.957 Euro | 14.644 Euro | 1,70 | 11.900 Euro (x0,81) | 2,10 |
| 3 | 16.338 Euro | 9.680 Euro | 1,69 | 6.700 Euro (x0,69) | 2,44 |

Ergebnis: Die Spitze zahlt rund 20% mehr und muss den Rest ausserhalb des
Sponsorings aufbringen, waehrend die unteren beiden Ligen spuerbar entlastet werden.

**Hinweis fuer spaetere Anpassungen:** Nicht am Gesamteinkommen kalibrieren. Dort
machen Gehaelter in Liga 0 nur wenige Prozent aus (Ticketverkaeufe und Transfers
dominieren), was die Belastung deutlich zu niedrig erscheinen laesst. Der Massstab
ist das Verhaeltnis Sponsor zu Gehalt.

## Technische Anforderungen

### Gehaltsberechnung

- **TA-SAL-01**: Die Funktion `getSalary(level)` ist in `client/util/player.js` implementiert und wird Client- und Server-seitig identisch verwendet.
- **TA-SAL-02**: Eine Exponentialkurve von `SALARY_AT_LEVEL_1` (72) bis
  `SALARY_AT_LEVEL_100` (18.500); beide Konstanten stehen in `client/util/player.js`.

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

- Gehaltsformel-Validierung (Stuetzstellen 72 / 18.500, kalibrierte Tabellenwerte, Monotonie,
  gleichmaessige Steigung ohne Knick)
- Richtung der Aenderung: unterhalb des Schnittpunkts guenstiger, darueber teurer
- Bot-Team-Finanzbalance (Stadioneinnahmen >= Gehaltskosten)
- Finanzlog-Eintraege mit korrekten negativen Werten
