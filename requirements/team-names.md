# Team-Namen

## Beschreibung

Teams haben Namen, die aus bis zu drei Bestandteilen bestehen: Vereinspraefix 1, Vereinspraefix 2 und Stadtname. Bot-Teams erhalten zufaellig generierte Namen, Spieler koennen ihren Teamnamen ueber einen Baukasten-Editor anpassen.

## User Stories

- **US-TN-01**: Als Spieler kann ich meinen Teamnamen ueber einen Baukasten-Editor aendern.
- **US-TN-02**: Als Spieler waehle ich aus drei Dropdown-Listen (Praefix 1, Praefix 2, Stadtname) und sehe eine Live-Vorschau.
- **US-TN-03**: Als Spieler kann ich keinen Namen waehlen, der bereits von einem anderen Team verwendet wird.
- **US-TN-04**: Als Spieler sehe ich auf mobilen Geraeten eine verkuerzte Version meines Teamnamens.

## Namensbaukasten

### Praefix 1 (20 Optionen inkl. leer)

`1. FC`, `2. FC`, `AC`, `AS`, `BSV`, `F.C.`, `FC`, `FSC`, `FSV`, `FV`, `RB`, `SC`, `SSC`, `SV`, `VFB`, (leer)

### Praefix 2 (29 Optionen inkl. leer)

`Athletico`, `City`, `Dynamic`, `Dynamo`, `Eagle`, `Elite`, `Fortuna`, `Galaxy`, `Golden`, `Inter`, `Kickers`, `Olympic`, `Phoenix`, `Power`, `Rapid`, `Real`, `Royal`, `Sporting`, `Star`, `Traktor`, `Union`, `United`, `Victory`, (leer)

### Staedte (545+ Optionen)

Mischung aus fiktiven Staedten (Aetherbourne, Ironhold, etc.) und realen europaeischen Staedten (London, Manchester, Munich, Dortmund, Paris, Madrid, Barcelona, Milan, etc.).

### Namensformat

`[Praefix1] [Praefix2] [Stadt]` - Beispiele:
- "1. FC Dynamic Guetersloh"
- "SSC Elite Madrid"
- "Athletic Manchester"
- "Milan" (nur Stadt)

Moegliche Kombinationen: 314.900+ (vor Duplikat-Pruefung).

## Technische Anforderungen

### Namens-Generierung (Bot-Teams)

- **TA-TN-01**: Zufallsauswahl aus allen drei Komponenten mit `generateName()`.
- **TA-TN-02**: Mindestens ein Praefix muss gewaehlt sein (nicht beide leer).
- **TA-TN-03**: Rekursive Duplikat-Pruefung gegen bestehende Teamnamen.

### Namens-Aenderung

- **TA-TN-04**: API-Endpunkt `updateTeamName(name)` prueft Eindeutigkeit: `SELECT id FROM team WHERE name=? AND id<>?`.
- **TA-TN-05**: Bei Namensaenderung werden `standing_cache` und Saison-Ergebnis-Cache geleert.

### Namens-Anzeige

- **TA-TN-06**: `shortenTeamName(name)` kuerzt den mittleren Praefix auf mobilen Geraeten.
- **TA-TN-07**: Abkuerzungen und Stadtname (letztes Wort) bleiben immer sichtbar.

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `updateTeamName(name)` | Teamnamen aendern (mit Duplikat-Pruefung) |
| `getNameLibrary` | Alle verfuegbaren Namens-Komponenten abrufen |

### Datenbank

- **TA-TN-08**: `team.name` (VARCHAR 255) - keine explizite UNIQUE-Constraint, aber Eindeutigkeit per Query erzwungen.

### Frontend

- **TA-TN-09**: Klick auf Teamnamen-Header oeffnet Editor-Modal.
- **TA-TN-10**: Drei Dropdown-Selects mit "(none)"-Option fuer Praefixe.
- **TA-TN-11**: Stadtname-Dropdown alphabetisch sortiert mit Buchstaben-Trennern.
- **TA-TN-12**: Live-Vorschau des kombinierten Namens.
- **TA-TN-13**: Smart Parsing: Aktueller Name wird in Komponenten zerlegt und vorausgewaehlt.

### i18n

- **TA-TN-14**: Uebersetzungs-Keys: `myTeam.clickToEditName`, `myTeam.customizeTeamName`, `myTeam.clubPrefix1/2`, `myTeam.cityName`, `myTeam.preview`, `myTeam.nameUpdated`, `myTeam.selectNamePart`.

### Tests

- Team-Daten laden und Template rendern
- Formationswechsel loescht Spielerpositionen
- Gehalts- und Altersberechnungen
