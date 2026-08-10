# Benutzer-Registrierung & Authentifizierung

## Beschreibung

Spieler koennen sich mit Benutzername und Passwort registrieren, einloggen und ihr Konto verwalten. Die Authentifizierung basiert auf JWT-Tokens. Eine E-Mail-Adresse ist optional, wird aber fuer Passwort-Reset, Benachrichtigungen und das Referral-System benoetigt. Nach der Registrierung waehlt der Spieler sein Team selbst aus den freien Bot-Teams aus.

## User Stories

- **US-REG-01**: Als Besucher kann ich mich mit Benutzername und Passwort registrieren, optional mit E-Mail-Adresse.
- **US-REG-02**: Als Besucher kann ich mich mit meinen Zugangsdaten einloggen.
- **US-REG-03**: Als neuer Spieler waehle ich mein Team selbst aus den verfuegbaren freien Teams und erhalte 500.000 Euro Startkapital.
- **US-REG-04**: Als neuer Spieler erhalte ich 4 Starter-Aktionskarten: Nachwuchsspieler, Basis-Training, Starspieler und Nachwuchsstar.
- **US-REG-05**: Als Spieler kann ich die Sprache meines Kontos aendern (Englisch/Deutsch).
- **US-REG-06**: Als Spieler kann ich mein Konto loeschen (mit vollstaendiger Datenloeschung).
- **US-REG-07**: Als Spieler werde ich nach erfolgreicher Registrierung automatisch eingeloggt.
- **US-REG-08**: Als Spieler kann ich meine E-Mail-Adresse hinterlegen oder aendern und muss sie per Link-Klick bestaetigen.
- **US-REG-09**: Als Spieler kann ich mein Passwort per E-Mail zuruecksetzen, wenn ich es vergessen habe.
- **US-REG-10**: Als Spieler kann ich mein Passwort im eingeloggten Zustand aendern (altes Passwort erforderlich).
- **US-REG-11**: Als Spieler kann ich ein Profilbild hochladen und wieder entfernen.
- **US-REG-12**: Als Spieler kann ich E-Mail-Benachrichtigungen abbestellen.

## Technische Anforderungen

### Registrierung

- **TA-REG-01**: Benutzername: Nicht-leerer String, muss eindeutig sein.
- **TA-REG-02**: Passwort: Mindestens 8 Zeichen.
- **TA-REG-03**: Passwort-Hashing: Node.js `scrypt` mit 16-Byte-Zufalls-Salt, 64-Byte-Key.
- **TA-REG-04**: Speicherformat: `salt:derivedKeyHex`.
- **TA-REG-05**: E-Mail ist optional. Wird eine angegeben, wird sie normalisiert (`trim().toLowerCase()`), auf Format und Eindeutigkeit geprueft und zunaechst nur als `pending_email` gespeichert.
- **TA-REG-06**: Die Registrierung weist **kein** Team zu. Der Nutzer landet auf der `choose-team`-Seite und waehlt selbst (siehe Team-Auswahl).
- **TA-REG-07**: Bei Registrierung mit E-Mail wird ein Referral-Claim (`claimReferralForNewUser`) versucht; der Link-Invite-Claim (`claimLinkInviteForNewUser`, IP-basiert) laeuft immer. Die Belohnung des Einladenden wird erst bei E-Mail-Verifizierung ausgezahlt.

### Team-Auswahl (nach der Registrierung)

- **TA-REG-24**: Waehlbar sind nur Teams mit `user_id IS NULL`, `is_system_team = 0` und `level >= config.MIN_CHOOSABLE_LEVEL`.
- **TA-REG-25**: Zwei Wege: `chooseTeam(teamId)` (konkretes Team) oder `chooseRandomTeamInLeague(level, league)` (zufaelliges Team einer Liga).
- **TA-REG-26**: Beide nutzen `_takeOverTeam()`: Balance auf 500.000 Euro, `coach_since` setzen, Log-/Finanz-/Trade-Offer-/Sponsor-/Karten-Daten des Vorgaengers loeschen, `regenerateTeamData()`, laufende Stadionbauten sofort abschliessen, Willkommens-Log.
- **TA-REG-27**: Starter-Karten: **4** Stueck — `NEW_YOUTH_PLAYER_1`, `LEVEL_UP_PLAYER_40`, `STAR_PLAYER`
  und `NEW_YOUTH_PLAYER_3` (#518). Die Liste steht als `STARTER_ACTION_CARDS` in
  `server/routes/teamChoice.js` und wird von `chooseTeam` wie von `chooseRandomTeamInLeague` genutzt.
- **TA-REG-28**: Nach der Teamuebernahme geht eine Push-Benachrichtigung an alle Admins mit Manager- und
  Teamname (#449). Ausgeloest wird sie bei der **Teamwahl**, nicht bei der Registrierung — vorher gibt es
  keinen Teamnamen. Der Versand ist fire-and-forget: ein Push-Fehler darf die Uebernahme nie scheitern lassen.
- **TA-REG-28**: Ein Nutzer mit bestehendem Team kann nicht erneut waehlen (`chooseTeam.alreadyHasTeam`).

### Login

- **TA-REG-08**: JWT-Token wird mit `config.SECRET` signiert, User-ID in `sub`-Claim.
- **TA-REG-09**: Token wird im `Authorization: Bearer`-Header gesendet.
- **TA-REG-10**: Login trackt Plattform (web/ios/android), IP-Adresse und Geolocation.
- **TA-REG-11**: `last_login`-Timestamp wird aktualisiert.

### Konto-Verwaltung

- **TA-REG-12**: Sprachwechsel: `setLanguage(language)` aktualisiert `user.language` und leert den User-Cache.
- **TA-REG-13**: Konto-Loeschung: Kaskadierende Loeschung aller zugehoerigen Daten in einer Transaktion.
- **TA-REG-14**: Bei Loeschung wird das Team zu einem Bot-Team (user_id = NULL).
- **TA-REG-29**: Passwortwechsel im eingeloggten Zustand via `setPassword(oldPassword, newPassword)` — altes Passwort wird geprueft, neues muss >= 8 Zeichen haben.
- **TA-REG-30**: Profilbild via `uploadAvatar(data, type)` / `removeAvatar()`; Dateien liegen unter `${DATA_ROOT}/uploads/avatars/`.
- **TA-REG-31**: E-Mail-Benachrichtigungen abbestellbar via `setEmailOptOut(optOut)`.

### E-Mail-Verifizierung

- **TA-REG-15**: Neue oder geaenderte Adressen werden als `pending_email` gespeichert und erst nach Klick auf den Verifizierungslink in `email` uebernommen.
- **TA-REG-16**: Token: 32 Byte `crypto.randomBytes` als Hex, gespeichert in `email_verification_token`, Ablauf `email_verification_expires_at`.
- **TA-REG-17**: Gueltigkeitsdauer: **7 Tage** (`EMAIL_VERIFICATION_TTL_DAYS`).
- **TA-REG-18**: `verifyEmail(token)` ist **oeffentlich** (kein Auth), damit der Link auf jedem Geraet funktioniert.
- **TA-REG-19**: Bei Verifizierung wird erneut auf Eindeutigkeit geprueft, der User-Cache geleert und offene Referral-/Link-Invite-Belohnungen ausgezahlt.

### Passwort-Zuruecksetzen

- **TA-REG-20**: `requestPasswordReset(email)` gibt **immer** `success: true` zurueck, auch bei unbekannter Adresse — damit nicht durchsickert, welche E-Mails registriert sind.
- **TA-REG-21**: Nur Nutzer mit **verifizierter** Adresse (Spalte `email`, nicht `pending_email`) erhalten eine Reset-Mail.
- **TA-REG-22**: Token: 32 Byte Hex in `password_reset_token`, Ablauf `password_reset_expires_at`, Gueltigkeit **2 Stunden** (`PASSWORD_RESET_TTL_HOURS`).
- **TA-REG-23**: `resetPassword(token, newPassword)` ist **oeffentlich**, verlangt >= 8 Zeichen, loescht Token und leert den User-Cache. Die Reset-Mail wird in der Sprache des Nutzers verschickt (`user.language`).

### Datenbank

- **TA-REG-32**: Tabelle `user`: `id`, `username` (UNIQUE), `password`, `language` (Standard 'en'), `is_admin`, `last_login`, plattformspezifische Login-Felder, `created_at` sowie `email`, `pending_email`, `email_verification_token`, `email_verification_expires_at`, `password_reset_token`, `password_reset_expires_at`, E-Mail-Opt-out- und Avatar-Felder.
- **TA-REG-33**: Tabelle `device_token`: `user_id`, `token`, `platform`, UNIQUE auf `(user_id, platform)`.

### API-Endpunkte

| Endpunkt | Auth | Beschreibung |
|---|---|---|
| `createAccount(username, password, email?)` | Nein | Konto erstellen; E-Mail optional (alte Clients senden nur 2 Params) |
| `login(username, password, platform?, deviceUuid?)` | Nein | Einloggen, JWT zurueckgeben |
| `verifyEmail(token)` | Nein | E-Mail-Adresse bestaetigen |
| `requestPasswordReset(email)` | Nein | Reset-Link anfordern |
| `resetPassword(token, newPassword)` | Nein | Passwort per Token neu setzen |
| `setEmail(email)` | Ja | E-Mail hinterlegen/aendern (als `pending_email`) |
| `setPassword(oldPassword, newPassword)` | Ja | Passwort aendern |
| `setEmailOptOut(optOut)` | Ja | E-Mail-Benachrichtigungen ab-/anbestellen |
| `uploadAvatar(data, type)` / `removeAvatar` | Ja | Profilbild setzen/entfernen |
| `setLanguage(language)` | Ja | Sprache aendern |
| `deleteAccount` | Ja | Konto loeschen |
| `registerDeviceToken(token, platform)` | Ja | Push-Token registrieren |
| `clearBadge` | Ja | iOS Badge zuruecksetzen |
| `hasTeam` | Ja | Ob der Nutzer schon ein Team hat |
| `getAvailableTeams` / `getAvailableLeagues` | Ja | Waehlbare Teams bzw. Ligen |
| `chooseTeam(teamId)` | Ja | Konkretes freies Team uebernehmen |
| `chooseRandomTeamInLeague(level, league)` | Ja | Zufaelliges freies Team einer Liga uebernehmen |

### Frontend

- **TA-REG-34**: Login/Registrierung auf der Landing Page mit Toggle-Button.
- **TA-REG-35**: Konto-Einstellungen als Overlay (Sprache, E-Mail, Passwort, Profilbild, Konto loeschen).
- **TA-REG-36**: JWT-Token in `localStorage` unter `auth-token`.
- **TA-REG-37**: 401-Responses loeschen Token und loesen Seiten-Reload aus.
- **TA-REG-38**: Nach der Registrierung leitet der Client auf `choose-team` weiter, solange `hasTeam` false ist.

### Inaktivitaet

- **TA-REG-39**: Spieler, die 21+ Tage nicht eingeloggt waren, werden automatisch zu Bots konvertiert.
- **TA-REG-40**: Team wird Bot (user_id = NULL), User wird geloescht.

### Tests

- Login mit korrekten/falschen Zugangsdaten
- Registrierung mit Validierung (Laenge, Eindeutigkeit, E-Mail-Format, E-Mail-Duplikate)
- Rueckwaertskompatibilitaet von `createAccount` ohne E-Mail-Parameter
- E-Mail-Verifizierung: gueltiges Token, abgelaufenes Token, bereits belegte Adresse
- Passwort-Reset: unbekannte E-Mail gibt trotzdem Erfolg zurueck, abgelaufenes Token wird abgelehnt
- Team-Auswahl: freie Teams filtern, doppelte Auswahl verhindern, Starter-Karten korrekt vergeben
- Admin-Push bei neuem Manager: Empfaengerliste, Inhalt, Verhalten ohne Admin-Geraet und bei Push-Fehler
