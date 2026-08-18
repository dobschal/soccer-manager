# Karriereende (Rente)

## Beschreibung

Jeder Spieler hat eine feste Karrieredauer. Beim Anlegen bekommt er
`carrier_start_season` (Saison seines 16. Geburtstags) und
`carrier_end_season = carrier_start_season + 20..23`. Sein Alter ist damit
`aktuelle Saison - carrier_start_season + 16`, das Karriereende liegt zwischen
Alter 36 und 39.

**`carrier_end_season` ist die letzte aktive Saison, inklusive.** Ein Spieler
mit `carrier_end_season = 9` spielt Saison 9 vollständig zu Ende und geht erst
beim Übergang von Saison 9 nach 10 in Rente. Diese Lesart gilt überall gleich:

| Ort | Regel |
|-----|-------|
| Rentenlauf (`_archiveTooOldPlayers`) | `carrier_end_season <= Saison` beim Saisonwechsel |
| Transfermarkt (`getOffers`) | `carrier_end_season >= Saison` bleibt sichtbar |
| Ablösefreie Spieler (`getPlayersWithoutTeam`) | `carrier_end_season >= Saison` ist verpflichtbar |
| Rentenhinweis im Client (`willRetireNextSeason`) | `carrier_end_season <= Saison` |

Der Rentenlauf läuft **ausschließlich beim Saisonwechsel**, nie mitten in der
Saison: er ist daran gekoppelt, dass keine ungespielten Ligaspiele mehr
existieren.

## Das `is_retired`-Flag

Die Rente ist ein **eigener, gesetzter Zustand**, nicht nur eine Rechnung. Beim
Saisonwechsel bekommt jeder Spieler mit `carrier_end_season <= Saison` das Flag
`is_retired = 1`. Das Flag wird **nie wieder zurückgesetzt** — Rente ist eine
Einbahnstraße.

Im gleichen Durchlauf wird alles entfernt, was den Spieler wieder vor einen
Nutzer bringen könnte:

- `team_id = NULL` (er verlässt seinen Verein),
- `in_game_position` / `bench_position` geleert, laufende Werbereise beendet,
- **alle** Transferangebote zu ihm werden gelöscht,
- sein Manager bekommt eine Log-Nachricht.

Der Durchlauf erfasst dabei auch Spieler, die ihr Karriereende **als
Vereinslose** erreichen. Früher war er auf `team_id IS NOT NULL` beschränkt, so
dass diese Spieler überhaupt nicht bearbeitet wurden: ihre offenen Angebote
blieben für immer stehen (#556).

Das Flag ist die eine Bedingung, auf die jede Liste filtert — ablösefreie
Spieler, Transfermarkt, Bot-Verpflichtungen, Auffüllen des freien Marktes. Zwei
Schreibwege prüfen es zusätzlich, weil eine vor Mitternacht geöffnete Seite noch
veraltete Spieler anbietet: `givePlayerContract` und `acceptOffer` lehnen einen
Spieler mit Flag ab. Der Spieler bleibt für die Historie in der Datenbank,
taucht aber in keiner Liste mehr auf.

## User Stories

**US-RET-01**: Als Spieler sehe ich bei jedem Spieler, dessen aktuelle Saison
seine letzte ist, ein Sanduhr-Symbol in der Kaderliste und einen Hinweis im
Spieler-Detail, damit ich rechtzeitig Ersatz planen kann.

**US-RET-02**: Als Spieler kann ich mich darauf verlassen, dass der Hinweis aus
US-RET-01 genau eine Saison lang erscheint — nämlich in der Saison, an deren
Ende der Spieler tatsächlich aufhört.

**US-RET-03**: Als Spieler behalte ich einen Spieler mit Rentenhinweis die
komplette laufende Saison. Er kann normal aufgestellt, auf Werbereise geschickt
und auf dem Transfermarkt angeboten werden.

**US-RET-04**: Als Spieler bekomme ich beim Saisonwechsel eine Log-Nachricht in
meiner Sprache, wenn einer meiner Spieler seine Karriere beendet.

**US-RET-05**: Als Spieler kann ich einen ablösefreien Spieler auch dann noch
verpflichten, wenn die laufende Saison seine letzte ist — er ist bis zum
Saisonende voll einsatzfähig.

**US-RET-06**: Als Spieler kann ich keinen Spieler verpflichten, dessen
Karriere bereits beendet ist. Der Versuch wird mit einer Fehlermeldung
abgelehnt, auch wenn eine veraltete Liste ihn noch anbietet.

**US-RET-07**: Als Spieler kann ich mich darauf verlassen, dass ein Spieler nach
seinem Karriereende endgültig aus dem Spiel verschwindet: Er erscheint nicht
unter „Freie Spieler", nicht auf dem Transfermarkt und in keinem Kader — weder
bei mir noch bei anderen Managern, Bot-Teams oder dem International Oversea
Club. Es bleibt nur seine Historie.

**US-RET-08**: Als Spieler sehe ich im Spielerprofil eines pensionierten
Spielers den Hinweis „Karriere beendet" statt der Sanduhr. Die Sanduhr bedeutet
ausschließlich „das ist seine letzte Saison".

**US-RET-09**: Als Spieler kann ich einen Spieler in seiner letzten Saison nicht
mehr an ein computergesteuertes Team verkaufen — weder an ein Bot-Team noch an
den International Oversea Club. Sie geben für einen Spieler mit Sanduhr kein
Angebot ab und nehmen keines an; nur menschliche Manager dürfen das Risiko
eingehen (Details: [Player Transfers](player-transfers.md), TA-TRF-29).

## Historie

Bis August 2026 hat der Client `carrier_end_season <= Saison + 1` geprüft und
den Rentenhinweis dadurch eine Saison zu früh gezeigt: Spieler wurden als
„geht am Saisonende in Rente" markiert, spielten danach aber noch eine
komplette weitere Saison und wurden erneut markiert.

Im gleichen Zug wurde `givePlayerContract` abgesichert. Die Route hatte nur
geprüft, ob ein Spieler vereinslos ist, nicht ob seine Karriere schon vorbei
war. Da der Rentenlauf um 00:00 läuft, eine vorher geöffnete Seite die Spieler
aber weiter anbot, landeten in der Produktion zehn bereits pensionierte Spieler
wieder in Kadern und blieben dort über Saisons hinweg. Sie wurden per Migration
auf die laufende Saison verlängert und beenden ihre Karriere regulär beim
nächsten Saisonwechsel.

Im August 2026 kam #556 dazu: ein Nutzer verpflichtete einen 40-jährigen
Spieler, der laut Profil längst in Rente gegangen war, aus dem Kader eines
Bot-Teams. Ursache war, dass „in Rente" nirgends auf der Zeile stand, sondern an
jeder Leseposition neu als `carrier_end_season < Saison` berechnet wurde — und
dass der Rentenlauf Vereinslose komplett übersprang. In der Produktion standen
dadurch zwölf offene Kaufangebote des International Oversea Club für längst
pensionierte Spieler; für einen davon hatte der IOC zehn Angebote gestapelt,
weil seine Angebotssuche eine veraltete Verkaufsanzeige akzeptierte, deren
Spieler den anzeigenden Verein längst verlassen hatte. Seither trägt der Spieler
das `is_retired`-Flag.
