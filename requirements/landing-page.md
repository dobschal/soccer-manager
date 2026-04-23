# Landing Page

## Beschreibung

Die Landing Page ist der erste Beruehrungspunkt fuer neue und wiederkehrende Spieler. Sie praesentiert das Spiel mit Marketing-Inhalten, Screenshots und einem integrierten Login-/Registrierungsformular.

## User Stories

- **US-LP-01**: Als Besucher sehe ich eine ansprechende Hero-Sektion mit dem Spiel-Logo, Tagline und einem "Free to Play"-Badge.
- **US-LP-02**: Als Besucher kann ich mich direkt auf der Landing Page registrieren oder einloggen (Formular in der Hero-Sektion).
- **US-LP-03**: Als Besucher kann ich zwischen Login- und Registrierungsmodus wechseln.
- **US-LP-04**: Als Besucher sehe ich vier Feature-Sektionen mit Screenshots, die die Kernfunktionen des Spiels vorstellen.
- **US-LP-05**: Als Besucher kann ich ueber den "Play Now"-Button zum Registrierungsformular scrollen.
- **US-LP-06**: Als Besucher sehe ich die Seite responsiv auf allen Geraeten (Desktop, Tablet, Mobile).
- **US-LP-07**: Als Besucher werde ich nach erfolgreicher Registrierung automatisch eingeloggt und zum Dashboard weitergeleitet.

## Sektionen

1. **Hero-Sektion**: Logo, Tagline, "Free to Play"-Badge, Vorschau-Bild, Login-/Registrierungs-Karte, Feature-Liste (nur Desktop), Scroll-Indikator
2. **Feature 1 - "Your Club, Your Rules"**: Kader-Management und Liga-Aufstieg
3. **Feature 2 - "Master Your Tactics"**: Formationen und Taktik (4-4-2, 3-4-3, 5-3-2)
4. **Feature 3 - "Build Your Stadium"**: Stadion-Ausbau und Ticket-Preise
5. **Feature 4 - "Collect Action Cards"**: Karten-System mit Merge-Mechanik
6. **CTA-Sektion**: "Ready to Start Your Journey?" mit "Play Now"-Button

## Technische Anforderungen

### Login/Registrierung

- **TA-LP-01**: Zwei Modi ueber `type`-Query-Parameter: `type=login` und `type=registration`.
- **TA-LP-02**: Registrierung validiert Passwort-Wiederholung (muessen uebereinstimmen).
- **TA-LP-03**: API-Aufrufe: `server.createAccount(username, password)` und `server.login(username, password, platform)`.
- **TA-LP-04**: Nach erfolgreicher Registrierung automatischer Login.
- **TA-LP-05**: WebSocket-Verbindung wird nach Authentifizierung hergestellt.
- **TA-LP-06**: JWT-Token wird in `localStorage` unter `auth-token` gespeichert.

### Design

- **TA-LP-07**: Hintergrund-Gradient: `linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0d4a5a 100%)`.
- **TA-LP-08**: Akzentfarbe: `#17a2b8` (Cyan/Teal).
- **TA-LP-09**: Login-Karte mit Glasmorphismus-Effekt: `backdrop-filter: blur(10px)`, halbtransparenter Hintergrund.
- **TA-LP-10**: Feature-Bilder mit Hover-Effekt: `translateY(-5px)` und verstaerkter Schatten.

### Responsive Design

- **TA-LP-11**: Tablet (max-width: 991px): Reduzierte Paddings und Schriftgroessen.
- **TA-LP-12**: Mobile (max-width: 576px): Kompaktere Login-Karte, kleinere Ueberschriften.
- **TA-LP-13**: Feature-Liste und Scroll-Indikator nur auf Desktop sichtbar (`d-none d-lg-block`).

### Animationen

- **TA-LP-14**: Scroll-Indikator mit Bounce-Animation (2s infinite).
- **TA-LP-15**: "Play Now"-Button scrollt sanft zum Login-Formular: `scrollIntoView({ behavior: 'smooth' })`.

### SEO

- **TA-LP-16**: Meta-Tags: Title, Description, Keywords, Robots, Canonical URL.
- **TA-LP-17**: Open Graph Tags: site_name, title, description, image (og-preview.jpg, 1536x1024).
- **TA-LP-18**: Twitter Card: summary_large_image.

### Native App Variante

- **TA-LP-19**: Separate `native-landing.js` mit vereinfachtem Layout (einzelne Karte, ohne Feature-Sektionen).
- **TA-LP-20**: Device-Token-Registrierung fuer Push-Benachrichtigungen.
- **TA-LP-21**: Plattform-Erkennung (iOS/Android).

### i18n

- **TA-LP-22**: 23+ Uebersetzungs-Keys fuer alle Texte der Landing Page.
- **TA-LP-23**: Unterstuetzte Sprachen: Englisch (en) und Deutsch (de).
