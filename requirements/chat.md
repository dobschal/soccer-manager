# Direktnachrichten (Chat)

## Beschreibung

Manager koennen sich gegenseitig private Eins-zu-eins-Nachrichten schicken — Text, Bilder und
Sprachnachrichten. Der Chat laeuft als Overlay ueber der jeweils geoeffneten Seite, damit der
Nutzer seinen Platz im Spiel nicht verliert.

## User Stories

- **US-CHT-01**: Als Spieler kann ich jedem anderen Manager eine private Nachricht schicken.
- **US-CHT-02**: Als Spieler kann ich einer Nachricht ein Bild anhaengen.
- **US-CHT-03**: Als Spieler sehe ich ungelesene Nachrichten als Zaehler auf dem Dashboard.
- **US-CHT-04**: Als Spieler erhalte ich eine Push-Benachrichtigung mit Deep-Link in den Chat.
- **US-CHT-05**: Als Spieler kann ich eine Sprachnachricht aufnehmen und verschicken (#541).
- **US-CHT-06**: Als Spieler sehe ich waehrend der Aufnahme die laufende Zeit und kann die Aufnahme
  verwerfen oder abschicken.
- **US-CHT-07**: Als Spieler kann ich eine empfangene Sprachnachricht direkt in der Nachrichtenblase
  abspielen und sehe ihre Laenge.
- **US-CHT-08**: Als Spieler sehe ich meine laufenden Unterhaltungen als Liste im Reiter „Freunde“ —
  Profilbild, Name, Vorschau der letzten Nachricht und deren Zeitstempel.
- **US-CHT-09**: Als Spieler erkenne ich an der Hervorhebung einer Zeile, dass in dieser Unterhaltung
  ungelesene Nachrichten liegen.
- **US-CHT-10**: Als Spieler oeffne ich per Klick auf eine Zeile das Chat-Overlay dieser Unterhaltung.

## Chat-Liste auf der Freunde-Seite

Die Chat-Liste steht **ueber** der Freundesliste (`client/pages/dashboard/friendsPage.js`).

| Aspekt | Wert |
|---|---|
| Eintraege pro Seite | 5, mit Vor-/Zurueck-Blaettern (`CHATS_PER_PAGE`) |
| Sortierung | letzte Nachricht zuerst (Server-Reihenfolge aus `getConversations`) |
| Hervorhebung | `bg-info-subtle` + `chat-list-item--unread`, sobald `unread > 0` |
| Zeitstempel | heute `hh:mm`, gestern „Gestern“, sonst `DD.MM.YYYY` |
| Klick | setzt `chat_user` als Query-Param — das Overlay oeffnet ueber `chatDeepLink` |

- **TA-CHT-16**: Die Vorschau wird **client-seitig** zusammengesetzt. Der Server liefert nur
  `text`, `hasImage`, `hasAudio` und `fromMe`; die Platzhalter „Foto“ / „Sprachnachricht“ und das
  Praefix „Du: “ folgen damit der Sprache des Lesers, nicht der des Absenders.
- **TA-CHT-17**: Die Liste aktualisiert sich ohne Reload: `NEW_CHAT_MESSAGE` (WebSocket) und das
  Fenster-Event `CHAT_MESSAGES_READ_EVENT` (feuert, sobald das Overlay eine Unterhaltung laedt und
  damit als gelesen markiert) laden die Unterhaltungen neu.

## Sprachnachrichten (#541)

| Aspekt | Wert |
|---|---|
| Maximale Laenge | 120 Sekunden (`MAX_RECORDING_SECONDS` / `MAX_AUDIO_DURATION_SECONDS`) |
| Maximale Dateigroesse | 4 MB |
| Container (Upload) | `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/aac` |
| Container (Ablage) | `m4a`, `mp3`, `aac` — alles andere wird konvertiert |
| Ablage | `uploads/chat/<uuid>.<ext>`, wie Chat-Bilder |

- **TA-CHT-01**: Aufgenommen wird im Browser mit `MediaRecorder` (`client/lib/voiceRecorder.js`).
  Der Container haengt vom Browser ab — Chrome/Firefox liefern WebM/Opus, Safari und iOS MP4/AAC.
  `PREFERRED_MIME_TYPES` fragt deshalb **zuerst** nach `audio/mp4`, weil das der einzige Container ist,
  den auch jede Plattform abspielen kann.
- **TA-CHT-02**: Beim Erreichen der Maximallaenge wird das bereits Aufgenommene **abgeschickt**,
  nicht verworfen.
- **TA-CHT-03**: Das Mikrofon wird auf jedem Weg wieder freigegeben — beim Senden, beim Verwerfen
  und beim Schliessen des Overlays. Sonst bleibt die Aufnahme-Anzeige des Betriebssystems an.
- **TA-CHT-04**: Text, Bild und Sprachnachricht laufen ueber denselben Sende-Pfad
  (`_sendPayload`), damit sie nicht auseinanderlaufen koennen.

### Speicherung und Transkodierung (#541)

- **TA-CHT-24**: Der Data-URL-Header wird bis zum **ersten Komma** abgeschnitten
  (`decodeDataUrl`), nicht ueber `<typ>;base64,`. Chromes Blob-Typ ist
  `audio/webm;codecs=opus`, die URL also `data:audio/webm;codecs=opus;base64,…` — das alte Muster
  griff dort nicht, der Base64-Decoder stoppte am `=` in `codecs=opus` und jede Aufnahme aus
  Chrome/Firefox landete als dieselben 15 Byte Unsinn auf der Platte. Genau das war der „Error" im
  Audio-Player.

- **TA-CHT-18**: WebM/Opus und Ogg/Opus koennen von Safari und dem iOS-WebView **nicht** dekodiert —
  der Audio-Player zeigt dort nur „Error“. `ensurePlayableAudio` (`server/lib/audioTranscode.js`)
  wandelt jede hochgeladene Aufnahme, deren Container nicht in `UNIVERSAL_AUDIO_EXTENSIONS`
  (`m4a`, `mp3`, `aac`) steht, per ffmpeg nach AAC/m4a um (mono, 64 kbit/s). In der Datenbank steht
  immer der abspielbare Dateiname.
- **TA-CHT-19**: Das Docker-Image installiert dafuer `ffmpeg`. Fehlt das Binary (z.B. lokal), wird die
  Aufnahme unveraendert gespeichert statt verworfen — die Nachricht geht nie verloren.
- **TA-CHT-20**: Schlaegt die Konvertierung fehl, wird nur die halbfertige Zieldatei geloescht, nie das
  Original.
- **TA-CHT-21**: Bereits gespeicherte WebM-Nachrichten werden von der Migration
  „Transcode existing WebM voice messages to m4a (#541)“ nachtraeglich konvertiert.

### Plattform-Verfuegbarkeit

- **TA-CHT-05**: `canRecordAudio()` prueft `MediaRecorder` **und** `navigator.mediaDevices`. Ist eines
  nicht da, wird der Mikrofon-Button gar nicht erst gerendert.
- **TA-CHT-06**: **Android-App: Aufnahme nicht verfuegbar.** Der native WebView laedt die App per
  `file://`, was kein "secure context" ist — `navigator.mediaDevices` existiert dort nicht. Behoben
  waere das erst, wenn Android statt `file://` ueber einen `WebViewAssetLoader` unter
  `https://appassets.androidplatform.net` laedt; das betrifft auch den OTA-Update-Pfad und ist
  bewusst nicht Teil von #541.
- **TA-CHT-07**: **iOS-App und Browser: verfuegbar.** iOS braucht zusaetzlich
  `NSMicrophoneUsageDescription` in der `Info.plist` **und** die WKUIDelegate-Methode
  `webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:` — ohne sie
  lehnt WebKit den Zugriff ab iOS 15 stillschweigend ab.

## Chat-Overlay

- **TA-CHT-08**: Das Overlay ist unabhaengig von der Systemeinstellung dunkel gestylt. `chat.css` war
  die einzige Stylesheet-Datei im Projekt mit `prefers-color-scheme`; auf einem Geraet im
  Hell-Modus erschien die Nachrichtenliste dadurch als heller Block in der sonst dunklen App
  (#541).
- **TA-CHT-09**: Die Wisch-nach-unten-Geste zum Schliessen startet nicht, wenn die Beruehrung in
  einer verschachtelten Liste beginnt, die noch nach oben scrollen kann
  (`startedInsideScrollableContent`). Vorher schloss jedes Scrollen in der Nachrichtenliste das
  Overlay, weil die Overlay-Karte selbst nie scrollt und damit immer "ganz oben" schien (#541).
- **TA-CHT-22**: Der Chat ist ein **Sheet**, keine inhaltshohe Karte: `showOverlay` bekommt ueber die
  neue Option `cardClass` die Klasse `chat-overlay-card`, die Karte waechst auf die verfuegbare Hoehe
  (max. 760px auf dem Desktop), die Nachrichtenliste nimmt den Rest — dadurch sitzt die Eingabezeile
  immer ganz unten (#541).
- **TA-CHT-23**: In der nativen App ist die Chat-Karte von `padding-bottom: 10rem` ausgenommen
  (`native-app.css`). Die Regel schiebt sonst jedes Overlay ueber die Tab-Bar hinaus und hinterliess
  im Chat einen grossen weissen Bereich unter der Eingabezeile (#541).

## Datei-Uploads in der nativen App (#542)

Betrifft alle `<input type="file">` im Spiel: Vereinswappen, Profilbild, Chat, Forum, Beitraege
und Kommentare.

- **TA-CHT-10**: **iOS**: Ohne `NSCameraUsageDescription` bzw. `NSPhotoLibraryUsageDescription`
  **beendet iOS die App**, sobald der Datei-Dialog des WebViews die Kamera oder die Mediathek
  anfasst. Genau das war der gemeldete Absturz bei "Take Photo". Beide Texte stehen jetzt in der
  `Info.plist`.
- **TA-CHT-11**: **Android**: Der Standard-`WebChromeClient` ignoriert `<input type="file">`
  komplett — Datei-Uploads funktionierten in der Android-App also nie. `onShowFileChooser` oeffnet
  jetzt den vom HTML angeforderten Dialog (`fileChooserParams.createIntent()`) und stellt eine
  Kamera-Aufnahme daneben.
- **TA-CHT-12**: Die Kamera schreibt in `cacheDir/camera/` und wird ueber einen `FileProvider`
  (`${applicationId}.fileprovider`, `res/xml/file_provider_paths.xml`) geteilt. Ein rohes
  `file://`-URI wuerde ab Android 7 eine `FileUriExposedException` ausloesen.
- **TA-CHT-13**: `onReceiveValue` wird auf **jedem** Pfad genau einmal aufgerufen — auch bei
  Abbruch oder Fehler. Bleibt der Aufruf aus, ist das Datei-Feld der Seite bis zum Neustart der App
  tot.

## Technische Anforderungen

### Datenbank

- **TA-CHT-14**: `chat_message` traegt `audio` (Dateiname) und `audio_duration` (Sekunden)
  zusaetzlich zu `text` und `image`.
- **TA-CHT-15**: Eine Nachricht braucht mindestens eines von Text, Bild oder Sprachnachricht.

### API

| Endpunkt | Zweck |
|---|---|
| `getConversations()` | Gespraechsliste mit Ungelesen-Zaehler, `lastMessageAt` und `lastMessage` (`text`, `hasImage`, `hasAudio`, `fromMe`) |
| `getChatMessages(userId)` | Verlauf eines Gespraechs, inkl. `audio` / `audio_duration` |
| `sendChatMessage(toUserId, text, image, audio)` | Nachricht senden |
| `getUnreadChatCount()` | Zaehler fuer das Dashboard |

### Tests

- Sprachnachricht speichern: Container-Erkennung inkl. Codec-Parameter, abgelehnte Formate,
  Groessen- und Laengenbegrenzung, fehlende/negative Dauer
- Push-Vorschau: Sprachnachricht vs. Bild vs. Text
- Recorder: Verfuegbarkeitspruefung, Container-Wahl, Mikrofon-Freigabe auf allen Pfaden,
  Zeitzaehler und Maximallaenge
- Overlay: Wisch-Geste startet nicht in einer gescrollten Liste
- `getConversations`: Vorschau-Felder, Ungelesen-Zaehler, leere Liste
- Chat-Liste: Reihenfolge ueber der Freundesliste, Hervorhebung ungelesener Chats, Bild-/Sprach-
  Platzhalter, 5 Eintraege pro Seite
