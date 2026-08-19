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
- **US-REG-13**: Als Spieler sehe ich im Profil eines Managers unter der Zeile „Zuletzt aktiv“ dessen Land (Flagge + Landesname) und die von ihm eingestellte Sprache (Englisch/Deutsch).

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
- **TA-REG-11**: `last_login`-Timestamp wird aktualisiert. Aktualisiert wird er **nicht nur** beim
  Login, sondern auch beim Laden des Dashboards (`routes/dashboard.js`) — sonst wuerden Nutzer mit
  gueltigem JWT nie wieder als aktiv gelten und nach 21 Tagen geloescht (siehe Inaktivitaet).

### Registrierungs-Funnel-Tracking

- **TA-REG-41**: Der Funnel wird in zwei Tabellen erfasst: `page_view` fuer echte Routen und
  `funnel_event` fuer Schritte, die keine Route sind. Die Reihenfolge steht als `FUNNEL_STEPS` in
  `server/helper/funnelHelper.js` und ist die einzige Quelle der Wahrheit fuer die Admin-Auswertung.
- **TA-REG-42**: Es gibt **keine** Route `landing` und **keine** Route `register`. Die Landing Page
  wird von der `login`-Route gerendert (`client/app.js`: `login: [DefaultLayout, LandingPage]`), und
  die Registrierung ist ein Modus desselben Formulars. Funnel-Schritte, die auf diese Keys zeigen,
  melden dauerhaft 0 — deshalb ist der Registrierungsversuch ein Event, keine Seite.
- **TA-REG-43**: Events werden **serverseitig** in `createAccount` / `login` geschrieben, damit Web-
  und Native-Client automatisch abgedeckt sind:
  `register-attempt` (vor jeder Validierung), `register-success` (mit neuer `user_id`),
  `register-error` + Grund, `login-error` + Grund. Erfolgreiche Logins werden **nicht** erfasst — der
  Auto-Login nach der Registrierung wuerde jeden Erfolgszaehler verfaelschen, und `user.last_login`
  deckt den Fall schon ab.
- **TA-REG-44**: Gruende sind maschinenlesbare Keys (`username-taken`, `password-too-short`,
  `email-invalid`, `email-blocked`, `email-taken`, `username-invalid`, `wrong-password`,
  `unknown-user`, `account-blocked`) — nie die uebersetzte Fehlermeldung, sonst laesst sich nicht
  gruppieren. Eingegebene Werte (Passwort, E-Mail) werden **nie** gespeichert.
- **TA-REG-45**: Versuche, die die clientseitige Validierung abfaengt, erreichen keine Route und
  werden vom Client als `register-abort` + Grund gemeldet (`client/lib/tracking.js`). Die
  Admin-Auswertung zaehlt `register-error` und `register-abort` gemeinsam.
- **TA-REG-46**: Der Client sendet seine anonyme Besucher-ID auf **jedem** Gateway-Request als
  `X-Client-Id`-Header (`client/lib/gateway.js`), damit Routen vor dem Login ihre Events demselben
  Besucher zuordnen koennen, der die Landing Page gesehen hat. Die ID liegt in `localStorage`
  (`fm_client_id`, siehe `client/lib/clientId.js`); ist `localStorage` gesperrt, faellt sie weg,
  ohne den Request zu brechen.
- **TA-REG-47**: Tracking ist **best effort**: `recordFunnelEvent` schluckt DB-Fehler und loggt sie
  nur — eine kaputte Analytics-Tabelle darf niemals eine Registrierung verhindern.
- **TA-REG-48**: `funnel_event`-Zeilen werden bei Konto-Loeschung mitgeloescht
  (`deleteUserContentRows`), genau wie `page_view`.

### Konto-Verwaltung

- **TA-REG-12**: Sprachwechsel: `setLanguage(language)` aktualisiert `user.language` und leert den User-Cache.
- **TA-REG-13**: Konto-Loeschung: Kaskadierende Loeschung aller zugehoerigen Daten in einer Transaktion.
- **TA-REG-14**: Bei Loeschung wird das Team zu einem Bot-Team (user_id = NULL).
- **TA-REG-29**: Passwortwechsel im eingeloggten Zustand via `setPassword(oldPassword, newPassword)` — altes Passwort wird geprueft, neues muss >= 8 Zeichen haben.
- **TA-REG-30**: Profilbild via `uploadAvatar(data, type)` / `removeAvatar()`; Dateien liegen unter `${DATA_ROOT}/uploads/avatars/`.
- **TA-REG-31**: E-Mail-Benachrichtigungen abbestellbar via `setEmailOptOut(optOut)`.
- **TA-REG-50**: `getUserProfile(userId)` liefert zusaetzlich `country` und `language`. Das Land ist
  `COALESCE(last_country_web, last_country_ios, last_country_android)` — der Web-Login gewinnt vor den
  App-Logins (gleiche Reihenfolge wie in der Admin-Statistik). Es stammt aus der GeoIP-Aufloesung des
  letzten Logins, ist also kein vom Spieler gepflegtes Feld. Der Client zeigt den Landesnamen ueber
  `Intl.DisplayNames` in der Sprache des Betrachters und die Flagge von `flagcdn.com`
  (`client/util/userLocale.js`); fehlt eines der beiden Felder, entfaellt nur dieser Teil der Zeile.

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
- **TA-REG-49**: Tabelle `funnel_event`: `user_id` (nullable — Events vor dem Login haben keinen),
  `client_id` (anonyme Besucher-ID, VARCHAR(64)), `event`, `detail` (Grund, nullable), `created_at`.
  Indizes auf `event`, `created_at` und `client_id`.

### API-Endpunkte

| Endpunkt | Auth | Beschreibung |
|---|---|---|
| `createAccount(username, password, email?)` | Nein | Konto erstellen; E-Mail optional (alte Clients senden nur 2 Params) |
| `trackFunnelEvent(event, detail?, clientId?)` | Nein | Funnel-Event melden, das der Server nicht selbst sieht (z.B. `register-abort`) |
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
- Funnel-Tracking: `register-attempt` vor der Validierung, `register-success` mit `user_id`, ein
  maschinenlesbarer Grund pro Ablehnung, kein Event bei erfolgreichem Login
- `FUNNEL_STEPS` zeigt nur auf existierende Routen (Regressionstest gegen `landing` / `register`)
- `X-Client-Id` wird mitgesendet, auch unauthentifiziert; gesperrtes `localStorage` bricht den
  Request nicht
- Konto-Loeschung entfernt `funnel_event`-Zeilen
