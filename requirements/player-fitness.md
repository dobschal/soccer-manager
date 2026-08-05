# Spieler-Fitness (Freshness)

## Beschreibung

Fitness (im Code "Freshness") ist ein Wert zwischen 0.0 und 1.0, der die aktuelle Energie eines Spielers darstellt. Die Fitness beeinflusst direkt die Spielstaerke und muss durch Rotation und Erholung gemanagt werden.

## User Stories

- **US-FIT-01**: Als Spieler sehe ich die aktuelle Fitness jedes Spielers als Prozentwert mit Farbcodierung (Gruen >= 70%, Gelb 40-70%, Rot < 40%).
- **US-FIT-02**: Als Spieler weiss ich, dass die Fitness meiner Spieler nach jedem Spiel sinkt und sich durch Ruhetage erholt.
- **US-FIT-03**: Als Spieler kann ich Fitness-Aktionskarten einsetzen, um Spielern sofort Fitness wiederherzustellen.
- **US-FIT-04**: Als Spieler erhalte ich eine Warnung, wenn Aufstellungs-Spieler unter 50% Fitness fallen.
- **US-FIT-05**: Als Spieler kann ich durch Kaderrotation die Fitness meiner Stammspieler erhalten.

## Technische Anforderungen

### Fitness-Auswirkung auf Spielstaerke

- **TA-FIT-01**: Effektives Spieler-Level in Liga- und Pokalspielen: `frische * basisLevel * (istStarspieler ? 1.1 : 1)`.
  - ⚠️ **Abweichung**: In Freundschaftsspielen rechnet `routes/friendly.js` nur `frische * basisLevel` — der Starspieler-Bonus wird dort **nicht** angewendet. Ob das Absicht ist, ist ungeklaert; bis zur Entscheidung beschreibt dieser Punkt das tatsaechliche Verhalten.
- **TA-FIT-02**: Datenbank: `player.freshness` als DECIMAL(6,2), Standard 1.0.

### Fitness-Verlust (pro Spiel)

Der Verlust ergibt sich aus drei Faktoren:

```
fitnessVerlust = basisVerlust * spielanteil * staerkeSkalierung
```

**Basisverlust** nach Spielstil (`_applyFreshnessLoss` in `server/play-game-day.js`):

| Spielstil | Feldspieler | Torwart |
|---|---|---|
| Aggressiv | 12% (0.12) | 8% (0.08) |
| Normal | 10% (0.10) | 8% (0.08) |
| Freundlich | 8% (0.08) | 8% (0.08) |

- **TA-FIT-13**: **Spielanteil** (`playedShare`): `(exitMinute - enterMinute) / gesamtMinuten`, geklemmt auf [0, 1]. Spieler, die spaeter eingewechselt wurden oder das Feld frueher verlassen haben (ausgewechselt, Platzverweis, verletzt und ersetzt), verlieren proportional weniger. Eine komplette Spielzeit ergibt Faktor 1,0.
- **TA-FIT-14**: **Staerke-Skalierung** (`getFreshnessLossStrengthScale`): `kombinierteRohstaerke / 1000`, geklemmt auf **[0.5, 1.5]**. Bei einer kombinierten Staerke von 1000 (`FRESHNESS_LOSS_REFERENCE_STRENGTH`) entspricht das dem historischen statischen Verlust (Faktor 1,0). Starke Duelle kosten mehr Fitness, Bot-/Unterliga-Spiele weniger (siehe #355).
- **TA-FIT-03**: Freundschaftsspiele: Halber Fitness-Verlust (Aggressiv 6,5%, Normal 5%, Freundlich 4%, Torwart 4%) — hier **ohne** Spielanteil- und Staerke-Skalierung, da `routes/friendly.js` einen eigenen, einfacheren Pfad nutzt.
- **TA-FIT-04**: Fitness kann nicht unter 0.0 fallen.

### Fitness-Erholung (pro Spieltag)

| Alter | Basis-Erholung | + Bank-Bonus | Gesamt |
|---|---|---|---|
| <= 21 | 10% | +8% | 18% |
| 22-26 | 8% | +8% | 16% |
| 27-29 | 6% | +8% | 14% |
| 30-32 | 5% | +8% | 13% |
| 33+ | 4% | +8% | 12% |

- **TA-FIT-05**: Bank-Bonus: Spieler ohne `in_game_position` erhalten zusaetzlich 8% Erholung.
- **TA-FIT-06**: Zufallsfaktor: +-20% auf die Erholung.
- **TA-FIT-07**: Fitness kann nicht ueber 1.0 steigen.
- **TA-FIT-15**: **Verletzte Spieler regenerieren nicht** — sie verlieren stattdessen 5% Frische pro Spieltag (untere Grenze 0). Die Erholungsabfrage filtert `is_injured = 0` heraus.

### Fitness-Aktionskarten

| Karte | Fitness-Boost |
|---|---|
| FRESHNESS_5 | +5% (0.05) |
| FRESHNESS_10 | +10% (0.10) |
| FRESHNESS_20 | +20% (0.20) |

### Warnungen und Benachrichtigungen

- **TA-FIT-08**: Dashboard-Dringlichkeitsmeldung wenn Aufstellungs-Spieler < 50% Fitness.
- **TA-FIT-09**: Log-Nachricht wenn Aufstellungs-Spieler < 40% Fitness.

### Jugend-Fitness

- **TA-FIT-10**: Jugendspieler haben eine separate `fitness`-Eigenschaft (DECIMAL(4,3), Standard 0.7).
- **TA-FIT-11**: Training senkt Fitness um 5%, Freundschaftsspiel um 4%, Ruhe erhoeht um 6%.
- **TA-FIT-12**: Bei Befoerderung zum A-Team wird die Jugend-Fitness als Anfangs-Freshness uebernommen.

### Tests

- Fitness-Verlust pro Spielstil (Basiswerte)
- Spielanteil-Skalierung: Einwechselspieler und frueh ausgewechselte Spieler verlieren weniger
- Staerke-Skalierung inkl. Klemmung auf [0.5, 1.5] und Referenzstaerke 1000
- Freundschaftsspiel: halber Verlust ohne Spielanteil-/Staerke-Skalierung
- Altersbasierte Erholung mit Bank-Bonus
- Zufallsfaktor-Validierung
- Verletzte Spieler verlieren 5% pro Spieltag statt zu regenerieren
- Kaderrotations-Rentabilitaet (Erholung > Verlust)
