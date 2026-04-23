# Forum

## Beschreibung

Das Forum ermoeglicht die Kommunikation zwischen Spielern. Es ist in Kategorien unterteilt und unterstuetzt Posts mit Bildern, Kommentare und Likes. Admins koennen Kategorien verwalten und Inhalte moderieren.

## User Stories

### Navigation

- **US-FOR-01**: Als Spieler kann ich alle Forum-Kategorien mit Beitragsanzahl und letzter Aktivitaet einsehen.
- **US-FOR-02**: Als Spieler kann ich in eine Kategorie klicken, um deren Beitraege zu sehen (paginiert, 20 pro Seite).
- **US-FOR-03**: Als Spieler kann ich einen Beitrag anklicken, um den vollstaendigen Text mit allen Kommentaren zu lesen.

### Beitraege

- **US-FOR-04**: Als Spieler kann ich einen neuen Beitrag mit Titel, Text und bis zu 5 Bildern erstellen.
- **US-FOR-05**: Als Spieler kann ich Beitraege liken/unliken (Toggle mit Herz-Icon).
- **US-FOR-06**: Als Spieler kann ich Beitraege kommentieren, mit Text und bis zu 5 Bildern.

### Admin-Funktionen

- **US-FOR-07**: Als Admin kann ich Kategorien erstellen, bearbeiten und loeschen.
- **US-FOR-08**: Als Admin kann ich jeden Beitrag oder Kommentar loeschen (Moderation).
- **US-FOR-09**: Als Admin kann ich in der "News"-Kategorie posten (nur Admins erlaubt).

### Bilder

- **US-FOR-10**: Als Spieler kann ich Bilder vor dem Hochladen in einer Vorschau sehen und einzeln entfernen.
- **US-FOR-11**: Als Spieler kann ich Thumbnails anklicken, um Bilder in voller Groesse in einem Overlay zu sehen.

## Technische Anforderungen

### Datenbank

- **TA-FOR-01**: 6 Tabellen: `forum_category`, `forum_post`, `forum_comment`, `forum_post_like`, `forum_post_image`, `forum_comment_image`.
- **TA-FOR-02**: UTF8MB4-Charset fuer Emoji-Unterstuetzung.
- **TA-FOR-03**: Unique Constraint auf `(post_id, user_id)` in `forum_post_like` (ein Like pro User pro Post).
- **TA-FOR-04**: Kaskadierendes Loeschen bei Kategorie-Loeschung (alle Posts, Kommentare, Bilder).

### Validierung und Sicherheit

- **TA-FOR-05**: Post-Titel: max. 255 Zeichen, nicht leer.
- **TA-FOR-06**: Post-Text: max. 5.000 Zeichen, nicht leer.
- **TA-FOR-07**: Kommentar-Text: max. 1.000 Zeichen, nicht leer.
- **TA-FOR-08**: Bilder: max. 2 MB pro Bild, max. 5 pro Post/Kommentar, erlaubte Typen: JPEG, PNG, GIF, WebP.
- **TA-FOR-09**: Automatische Schimpfwort-Filterung via `maskBadWords()` (Englisch, Deutsch, Hassrede).
- **TA-FOR-10**: Admin-Check via `assertAdmin(req)` - prueft `is_admin`-Flag oder Benutzername.

### API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `getForumCategories` | Alle Kategorien mit Beitragsanzahl und letzter Aktivitaet |
| `createForumCategory(name, description)` | Neue Kategorie (Admin) |
| `updateForumCategory(id, name, description)` | Kategorie bearbeiten (Admin) |
| `deleteForumCategory(id)` | Kategorie loeschen mit Kaskade (Admin) |
| `getForumPosts(categoryId, page)` | Paginierte Beitraege (20/Seite) |
| `createForumPost(categoryId, title, text, images)` | Neuen Beitrag erstellen |
| `getForumPost(postId)` | Einzelner Beitrag mit Kommentaren |
| `deleteForumPost(postId)` | Beitrag loeschen (Admin) |
| `addForumComment(postId, text, images)` | Kommentar hinzufuegen |
| `deleteForumComment(commentId)` | Kommentar loeschen (Admin) |
| `toggleForumPostLike(postId)` | Like/Unlike Toggle |

### Frontend

- **TA-FOR-11**: Breadcrumb-Navigation: Forum > Kategorie > Beitrag.
- **TA-FOR-12**: Bild-Upload mit Client-seitiger Vorschau (Base64).
- **TA-FOR-13**: Bild-Overlay fuer Vollbild-Ansicht.
- **TA-FOR-14**: Upload-Verzeichnis: `uploads/forum/` mit UUID-basierten Dateinamen.
