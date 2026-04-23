# Benutzer-Registrierung & Authentifizierung

## Beschreibung

Spieler koennen sich mit Benutzername und Passwort registrieren, einloggen und ihr Konto verwalten. Die Authentifizierung basiert auf JWT-Tokens. Neue Spieler werden automatisch einem Bot-Team zugewiesen.

## User Stories

- **US-REG-01**: Als Besucher kann ich mich mit Benutzername und Passwort registrieren.
- **US-REG-02**: Als Besucher kann ich mich mit meinen Zugangsdaten einloggen.
- **US-REG-03**: Als neuer Spieler werde ich automatisch einem Bot-Team zugewiesen und erhalte 500.000 Euro Startkapital.
- **US-REG-04**: Als neuer Spieler erhalte ich 3 Starter-Aktionskarten (Positionswechsel, Jugendspieler, Level-Up).
- **US-REG-05**: Als Spieler kann ich die Sprache meines Kontos aendern (Englisch/Deutsch).
- **US-REG-06**: Als Spieler kann ich mein Konto loeschen (mit vollstaendiger Datenloeschung).
- **US-REG-07**: Als Spieler werde ich nach erfolgreicher Registrierung automatisch eingeloggt.

## Technische Anforderungen

### Registrierung

- **TA-REG-01**: Benutzername: Nicht-leerer String, muss eindeutig sein.
- **TA-REG-02**: Passwort: Mindestens 8 Zeichen.
- **TA-REG-03**: Passwort-Hashing: Node.js `scrypt` mit 16-Byte-Zufalls-Salt, 64-Byte-Key.
- **TA-REG-04**: Speicherformat: `salt:derivedKeyHex`.
- **TA-REG-05**: Bei Registrierung wird das hoechststufige verfuegbare Bot-Team zugewiesen.
- **TA-REG-06**: Falls kein Bot-Team verfuegbar: `prepareSeason()` wird aufgerufen, um neue Teams zu erstellen.
- **TA-REG-07**: Initiales Setup: Balance 500.000 Euro, vorhandene Sponsor/Karten/Logs loeschen, 3 Starter-Karten erstellen.

### Login

- **TA-REG-08**: JWT-Token wird mit `config.SECRET` signiert, User-ID in `sub`-Claim.
- **TA-REG-09**: Token wird im `Authorization: Bearer`-Header gesendet.
- **TA-REG-10**: Login trackt Plattform (web/ios/android), IP-Adresse und Geolocation.
- **TA-REG-11**: `last_login`-Timestamp wird aktualisiert.

### Konto-Verwaltung

- **TA-REG-12**: Sprachwechsel: `setLanguage(language)` aktualisiert `user.language` und leert den User-Cache.
- **TA-REG-13**: Konto-Loeschung: Kaskadierende Loeschung aller zugehoerigen Daten in einer Transaktion.
- **TA-REG-14**: Bei Loeschung wird das Team zu einem Bot-Team (user_id = NULL).

### Passwort-Zuruecksetzen

- **TA-REG-15**: Aktuell **nicht implementiert**. Kein Passwort-Reset-Mechanismus vorhanden.

### Datenbank

- **TA-REG-16**: Tabelle `user`: `id`, `username` (UNIQUE), `password`, `language` (Standard 'en'), `is_admin`, `last_login`, plattformspezifische Login-Felder, `created_at`.
- **TA-REG-17**: Tabelle `device_token`: `user_id`, `token`, `platform`, UNIQUE auf `(user_id, platform)`.

### API-Endpunkte

| Endpunkt | Auth | Beschreibung |
|---|---|---|
| `createAccount(username, password)` | Nein | Konto erstellen |
| `login(username, password, platform?)` | Nein | Einloggen, JWT zurueckgeben |
| `setLanguage(language)` | Ja | Sprache aendern |
| `deleteAccount` | Ja | Konto loeschen |
| `registerDeviceToken(token, platform)` | Ja | Push-Token registrieren |
| `clearBadge` | Ja | iOS Badge zuruecksetzen |

### Frontend

- **TA-REG-18**: Login/Registrierung auf der Landing Page mit Toggle-Button.
- **TA-REG-19**: Konto-Einstellungen als Overlay (Sprache, Konto loeschen).
- **TA-REG-20**: JWT-Token in `localStorage` unter `auth-token`.
- **TA-REG-21**: 401-Responses loeschen Token und loesen Seiten-Reload aus.

### Inaktivitaet

- **TA-REG-22**: Spieler, die 21+ Tage nicht eingeloggt waren, werden automatisch zu Bots konvertiert.
- **TA-REG-23**: Team wird Bot (user_id = NULL), User wird geloescht.

### Tests

- Login mit korrekten/falschen Zugangsdaten
- Registrierung mit Validierung (Laenge, Eindeutigkeit)
- Team-Zuweisung bei Registrierung
- prepareSeason-Aufruf wenn keine Teams verfuegbar
