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

Zwei Exponentialsegmente, die sich bei Level 70 treffen:

```
base(level)      = floor(72 * (18500 / 72) ^ ((level - 1) / 99))
getSalary(level) = base(level)                                              fuer level <= 70
                 = floor(base(70) * (45000 / base(70)) ^ ((level - 70) / 30)) fuer level > 70
```

- Unterhalb des Pivots (Level 70) ist die Kurve identisch mit der Kalibrierung aus #543.
- Oberhalb laeuft ein deutlich steileres Segment bis 45.000 Euro auf Level 100.
- Fuer Level <= 0 wird 0 zurueckgegeben.

### Gehaltstabelle (Beispiele)

| Level | Gehalt pro Spieltag | vorher (#543) |
|---|---|---|
| 1 | 72 Euro | 72 Euro |
| 10 | 119 Euro | 119 Euro |
| 20 | 208 Euro | 208 Euro |
| 40 | 640 Euro | 640 Euro |
| 50 | 1.122 Euro | 1.122 Euro |
| 60 | 1.965 Euro | 1.965 Euro |
| 70 | 3.442 Euro | 3.442 Euro |
| 75 | 5.282 Euro | 4.556 Euro |
| 80 | 8.108 Euro | 6.030 Euro |
| 85 | 12.445 Euro | 7.980 Euro |
| 90 | 19.101 Euro | 10.562 Euro |
| 95 | 29.318 Euro | 13.978 Euro |
| 100 | 45.000 Euro | 18.500 Euro |

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

### Nachkalibrierung: Star-Segment

Nach #543 blieb ein Schlupfloch: die Kurve war zwar geneigt, aber die Neigung
war ueber den ganzen Bereich gleich. Ein Verein konnte einen ueberdimensionierten
Kader mit vielen 80+-Spielern halten, weil jeder einzelne Star nur graduell
teurer war als ein solider Stammspieler. Gemessen an echten Kaderdaten
(Liga 0/1, 30 Teams) sah das so aus:

| Team | Kader | Spieler 80+ | Sponsor/Tag | Gehalt alt | Gehalt neu | Faktor |
|---|---|---|---|---|---|---|
| Team mit 40er-Kader, 9x 80+ | 40 | 9 | 71.647 | 178.603 | 249.789 | 1,40 |
| Team mit 40er-Kader, 4x 80+ | 40 | 4 | 56.143 | 113.393 | 157.042 | 1,38 |
| Team mit 21er-Kader, 5x 80+ | 21 | 5 | 66.683 | 91.858 | 122.217 | 1,33 |
| Team mit 25er-Kader, 0x 80+ | 25 | 0 | 46.113 | 71.727 | 75.935 | 1,06 |

Auf Liga-Ebene (nur Teams mit menschlichem Manager, Sponsor-Deckung):

| Liga | Sponsor/Team | Gehalt alt | Deckung alt | Gehalt neu | Deckung neu |
|---|---|---|---|---|---|
| 0 | 60.504 Euro | 62.997 Euro | 0,96 | 74.224 Euro | 0,82 |
| 1 | 40.328 Euro | 31.232 Euro | 1,29 | 35.727 Euro | 1,13 |
| 2 | 25.144 Euro | 11.216 Euro | 2,24 | 11.247 Euro | 2,24 |
| 3 | 17.480 Euro | 7.283 Euro | 2,40 | 7.283 Euro | 2,40 |

Bot-Teams sind praktisch nicht betroffen (sie halten kaum 80+-Spieler): ihre
Deckung veraendert sich in allen Ligen um hoechstens 0,03.

**Beobachtung ausserhalb der Gehaltskurve:** Die Gehaltsliste ist bei
Spitzenvereinen nicht der begrenzende Faktor. Freundschaftsspiel-Ticketeinnahmen
erreichen bei einem Verein mit kleinem Stadion (10.000 Plaetze) ueber eine Saison
etwa dieselbe Groessenordnung wie die Liga-Ticketeinnahmen — ein Freundschaftsspiel
pro Spieltag (42/Saison) zu halber Auslastung, aber vollem Ticketpreis, schlaegt
17-21 Liga-Heimspiele. Wer das Wirtschaftssystem weiter nachziehen will, sollte
dort ansetzen, nicht an der Gehaltskurve.

## Technische Anforderungen

### Gehaltsberechnung

- **TA-SAL-01**: Die Funktion `getSalary(level)` ist in `client/util/player.js` implementiert und wird Client- und Server-seitig identisch verwendet.
- **TA-SAL-02**: Zwei Exponentialsegmente mit Pivot bei `SALARY_STAR_PIVOT_LEVEL` (70):
  von `SALARY_AT_LEVEL_1` (72) bis zum Pivot, danach bis `SALARY_AT_LEVEL_100` (45.000).
  Alle Konstanten stehen in `client/util/player.js`.

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

- Gehaltsformel-Validierung (Stuetzstellen 72 / 45.000, kalibrierte Tabellenwerte, strikte Monotonie,
  gleichmaessige Steigung innerhalb jedes Segments)
- Levels 1-70 identisch mit der #543-Kurve, kein Sprung am Pivot
- Star-Segment: Level 80/90/100 mindestens 1,3x / 1,7x / 2,4x der #543-Kurve
- Bot-Team-Finanzbalance (Stadioneinnahmen >= Gehaltskosten)
- Finanzlog-Eintraege mit korrekten negativen Werten
