# Spielbericht (KI-Analyse)

## Beschreibung

Im Spieldetail-Overlay kann sich jeder Manager oberhalb der Spielereignisse einen
KI-generierten Spielbericht erstellen lassen. Der Bericht bewertet, ob die
gewaehlte Taktik und Formation im jeweiligen Spiel funktioniert haben, und gibt
eine konkrete Empfehlung fuer die naechste Partie.

Die Analyse laeuft nicht auf dem Spiel-Log selbst: Das Roh-Log einer Partie ist
im Schnitt rund 86 KB gross und besteht fast vollstaendig aus Pass-Ereignissen
mit numerischen Spieler-IDs. Der Server verdichtet es deshalb zuerst zu
kompakten, benannten Fakten (rund 800 Tokens) und laesst das Sprachmodell nur
noch interpretieren — gerechnet wird ausschliesslich im Server-Code.

Ein Bericht wird pro Spiel und Sprache genau einmal erzeugt und danach
gespeichert. Wer ein Spiel oeffnet, fuer das bereits ein Bericht existiert,
sieht ihn sofort und ohne erneute Generierung.

## User Stories

- **US-REP-01**: Als Spieler sehe ich im Spieldetail-Overlay oberhalb der Spielereignisse eine Karte "Spielbericht".
- **US-REP-02**: Als Spieler kann ich ueber den Button "Spielbericht erstellen" eine KI-Analyse des Spiels anfordern.
- **US-REP-03**: Als Spieler sehe ich waehrend der Erstellung einen animierten Ball mit dem Hinweis "Spielbericht wird erstellt...".
- **US-REP-04**: Als Spieler lese ich im Bericht in zwei kurzen Absaetzen, welche taktischen Entscheidungen funktioniert haben und was ich im naechsten Spiel aendern sollte. Das Spiel wird nicht nacherzaehlt und das Ergebnis nicht zusammengefasst — beides steht direkt daneben.
- **US-REP-05**: Als Spieler sehe ich einen bereits erstellten Bericht beim naechsten Oeffnen des Spiels sofort, ohne ihn erneut erstellen zu muessen.
- **US-REP-06**: Als Spieler bekomme ich den Bericht in meiner eingestellten Sprache (Deutsch oder Englisch).
- **US-REP-07**: Als Spieler sehe ich unter dem Bericht einen Hinweis, dass der Text von einer KI erzeugt wurde und Fehler enthalten kann.
- **US-REP-08**: Als Spieler bekomme ich eine verstaendliche Fehlermeldung und kann es erneut versuchen, wenn die Erstellung fehlschlaegt.
- **US-REP-09**: Als Spieler finde ich die Karte "Spielbericht" beim Oeffnen des Spieldetail-Overlays zugeklappt vor und klappe sie ueber einen Klick auf ihre Kopfzeile auf; sie bleibt danach offen, waehrend der Bericht erzeugt wird.

## Verdichtete Fakten

Diese Werte werden aus dem Spiel-Log aggregiert und an das Modell uebergeben.
Alles davon stammt aus dem Log oder den Aufstellungsdaten — nichts wird
geschaetzt.

| Gruppe | Inhalt |
|---|---|
| Ergebnis | Endstand, Spieltag, Saison, Entscheidung (regulaer / Verlaengerung / Elfmeterschiessen) |
| Taktik | Formation (z. B. 4-4-2), Angriffsmodus, Spielstil, Passstil, Motivationsrede |
| Offensive | Torschuesse, Schuesse aufs Tor, Tore, Torschuetzen |
| Defensive | Paraden, gewonnene und verlorene Zweikaempfe, Zweikampfquote |
| Balleroberungen | Anzahl gesamt sowie nach Zone (Abwehr / Mittelfeld / Angriff), Top-3-Balleroberer |
| Ballverluste | Anzahl nach Zone — zeigt, ob ein offensiver Modus zu riskant war |
| Ballbesitz | Prozentanteil, laengste Passstafette, Paesse im Schnitt vor Ballverlust |
| Staerke | Teamstaerke, Grundstaerke und In-Game-Staerke im Schnitt, Frische im Schnitt |
| Kader | Pro Startspieler: Position, Grundstaerke, In-Game-Staerke, Frische |
| Ereignisse | Tore mit Aufbaulaenge, Rote Karten, Gelbe Karten, Verletzungen, Auswechslungen |
| Formations-Paarung | Vorteil der Heim- gegen die Auswaerts-Formation in Punkten pro Spiel, plus die Formationen, die gegen die jeweilige Grundordnung am besten abschneiden |

## Formations-Paarung

Die Grundordnung ist der groesste taktische Hebel der Engine, aber der einzige,
den man der Spielstatistik nicht ansieht: `_fightsOpponents` in
`server/play-game.js` stellt den ballfuehrenden Spieler gegen die Gegenspieler
auf der Konterposition (`determineOponentPosition`: CM gegen CM, DM gegen OM,
CD gegen CA). Besetzt der Gegner diese Position gar nicht, laeuft der Spieler
ohne Zweikampf durch (`streak += 3`) — dieses Nicht-Ereignis taucht im Spiel-Log
nirgends auf. Jeder zusaetzliche Gegenspieler auf der Konterposition ist
umgekehrt ein weiterer Zweikampf, den der Ballfuehrende ueberstehen muss.

Deshalb bekommt das Modell die Paarung als eigenen Fakt mitgeliefert. Die Werte
stammen nicht aus Produktionsdaten — dort sind Formations-Statistiken durch
Kaderstaerke, Heimvorteil und Manager-Engagement verzerrt —, sondern aus einer
Simulation der Engine mit identischen Kadern:

| Eigenschaft | Wert |
|---|---|
| Quelle | `server/data/formationMatchups.js`, erzeugt von `scripts/generate-formation-matchups.mjs` |
| Simulierte Spiele | 2.000 je geordnetem Formationspaar (200.000 gesamt) |
| Kader | 11 identische Spieler mit Level 32 je Seite, alle Taktiken auf Standard |
| Standardfehler je Zelle | rund 0,019 Punkte — ab ±0,06 ist ein Wert echt |
| Groesste Paarung | rund 0,4 Punkte pro Spiel (z. B. 442a gegen 541) |

Die Tabelle ist antisymmetrisch (`[a][b] === -[b][a]`, Diagonale 0). Als Konter
werden nur Formationen genannt, die tatsaechlich im Vorteil sind (mindestens
+0,06); eine Formation, die nur weniger deutlich verliert, ist kein Konter.
Spiele ohne gespeicherte Formation und unbekannte Formationen lassen den Block
komplett weg, statt eine ausgeglichene Paarung zu behaupten.

Die Tabelle ist eine Momentaufnahme der Engine: Aendern sich die Konterpositionen,
die Zweikampf-Berechnung oder die verfuegbaren Formationen, muss der Generator
neu laufen.

## Grenzen

| Regel | Wert |
|---|---|
| Neue Berichte pro Nutzer und Stunde | 20 |
| Zwischengespeicherte Berichte | zaehlen nicht gegen das Limit |
| Bericht pro Spiel und Sprache | genau einer |
| Timeout einer Modell-Anfrage | 45 Sekunden |
| Laenge des Berichts | 2 Absaetze, hoechstens 120 Woerter (Ausgabe-Limit 400 Tokens) |

Fuer abgesagte (kampflos gewertete) und noch nicht gespielte Partien gibt es
keinen Bericht, weil dafuer keine Spieldaten existieren. Ist auf dem Server
kein API-Schluessel hinterlegt, wird die Karte gar nicht erst angezeigt.
