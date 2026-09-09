# Swiss Baan Chiang — Concierge & Informationssystem

Digitales Concierge-System, live auf GitHub Pages: Gäste sehen Hotelinfos und
bestellen Leistungen über das Zimmer-Tablet oder ihr eigenes Smartphone.
Das Personal pflegt Inhalte und sieht eingehende Bestellungen über eine
passwortgeschützte Backoffice-Ansicht am PC. Beide Seiten teilen sich eine
echte Datenbank (Supabase) mit Live-Synchronisation über Geräte- und
Zimmergrenzen hinweg.

- **Live:** https://concierge.swissbaanchiang.com/index.html (Gäste) ·
  https://concierge.swissbaanchiang.com/admin.html (Backoffice, Login erforderlich)
  — eigene Domain über GitHub Pages, siehe `CNAME`-Datei im Repo-Root
  (DNS bei Hostinger, siehe "Eigene Domain" weiter unten).

## Struktur

- `index.html` + `js/app.js` — Gästeansicht (Tablet im Zimmer / Smartphone per QR-Code)
- `admin.html` + `js/admin.js` — Backoffice für das Personal (PC an der Rezeption, hinter Login)
- `js/supabaseClient.js` — Supabase-Verbindung (Projekt-URL + öffentlicher „publishable key")
- `js/store.js` — gemeinsamer Datenspeicher: lädt beim Start aus Supabase und hält sich per
  Realtime auf dem aktuellen Stand (siehe "Architektur & Live-Synchronisation")
- `js/data.js` + `generate-seed.js` — Ausgangsdaten, nur zum (Re-)Erzeugen von `seed.sql`
  falls die Datenbank einmal neu aufgesetzt werden muss; die laufende App liest nicht mehr
  aus dieser Datei
- `js/i18n.js` — Übersetzungen der Bedienoberfläche
- `js/icons.js` — generiertes Icon-Set (siehe "Design-System")
- `supabase/functions/manage-staff` — Server-Funktion fürs Einladen neuer
  Mitarbeiter-Konten und Rollenwechsel (siehe "Rollen fürs Personal")

## Design-System

Farben, Typografie, Button-/Input-Formen und Icons sind aus dem offiziellen
Swiss-Baan-Chiang-Brandkit übernommen:

- **Farben**: Hintergrund `#172f3c`, Gold-Akzent `#bfa672`, Kupfer-Akzent
  (Haupt-Button-Farbe) `#b28066`, Sand Deep `#d4c5b0`, Clay `#8a6750` — als
  CSS-Variablen in [css/style.css](css/style.css) (`:root`).
- **Typografie**: „Italiana"/„Marcellus" für Titel & Logo, „Montserrat" für
  Fliesstext, Navigation und Labels (alle drei frei über Google Fonts).
- **Buttons**: rechteckig mit leichter Rundung (Vorgabe aus dem Brandkit) —
  Formulareingaben dagegen als Pille, wie im Kontaktformular des Brandkits.
- **Icons**: ausschliesslich [Lucide](https://lucide.dev) (ISC-Lizenz), Strichstärke
  1.25px, keine Emojis — genau wie im Brandkit vorgegeben. Alle benötigten
  Icons sind bereits fertig in `js/icons.js` erzeugt; wird ein weiteres Icon
  gebraucht, in `generate-icons.js` zur `NEEDED`-Liste hinzufügen
  (Icon-Namen siehe `node_modules/lucide-static/icons/`) und
  `node generate-icons.js` erneut ausführen (`npm install` lädt dafür einmalig
  `lucide-static` als Dev-Tool, wird von der App selbst nicht benötigt).
- **Logo & Favicon**: [js/logo.js](js/logo.js) — die Amphore aus dem Brandkit,
  von Hand als SVG nachgebaut (zuletzt anhand der vom Nutzer bereitgestellten
  Referenzgrafik verfeinert). `vaseLogo()` liefert die Marke überall dort, wo
  sie in der App auftaucht: Kopfzeile (Gast), Sidebar (Backoffice), Postkarten-
  Stempel und die Vollbild-Postkarte. [favicon.svg](favicon.svg) nutzt dieselbe
  Silhouette auf der Marken-Hintergrundfarbe; PNG-Fallbacks (`favicon-32.png`
  fürs Browser-Tab, `favicon-180.png` als Apple-Touch-Icon) liegen daneben.
  Bei Änderungen an `favicon.svg` mit `node render-favicons.js` neu erzeugen
  (braucht `canvas` als Dev-Tool, nicht Teil der ausgelieferten App).

## Lokal starten

Da die App ES-Module lädt, muss sie über einen kleinen HTTP-Server laufen
(nicht direkt per Doppelklick auf `index.html` öffnen). Im Projektordner:

```bash
node serve.js 5173
```

Danach im Browser öffnen:

- Gästeansicht: `http://localhost:5173/index.html`
- Backoffice: `http://localhost:5173/admin.html`

Am besten beide gleichzeitig in zwei Tabs/Fenstern öffnen, um die
Live-Synchronisation zu sehen — z. B. Backoffice auf dem Bildschirm der
Rezeption, Gästeansicht auf einem zweiten Fenster als simuliertes Tablet.

**Achtung:** `js/supabaseClient.js` zeigt fest auf das echte Live-Projekt —
lokal getestete Bestellungen, Postkarten und Inhaltsänderungen landen also
in derselben Datenbank wie die produktive Seite, nicht in einer isolierten
Testumgebung. Für risikofreies Ausprobieren im Backoffice ein separates
Supabase-Projekt anlegen und dessen URL/Key dort eintragen.

## Architektur & Live-Synchronisation

Backend ist ein Supabase-Projekt „Concierge" (Postgres + Realtime + Auth),
eu-central-1, im Account des Betreibers. Tabellen: `hotel_content` (eine
Zeile mit WLAN/Öffnungszeiten/Willkommenstext/Hausregeln/Ausflugstipps als
JSONB), `rooms`, `menu_categories`, `menu_items`, `housekeeping_options`,
`spa_services`, `taxi_options`, `excursions`, `orders`, `postcards`.

- **Lesen** ist für alle offen (Gäste brauchen keinen Account, um Inhalte zu
  sehen oder Bestellungen/Postkarten aufzugeben) — abgesichert per Row-Level-
  Security-Policy `using (true)` auf SELECT (und INSERT bei `orders`).
- **Schreiben** an Inhalten/Katalogdaten sowie Status-Änderungen und Postkarten-
  Versand ist nur mit gültigem Supabase-Auth-Login möglich (RLS-Policy
  `auth.role() = 'authenticated'`). Genau das schützt `admin.html`.
- **Live-Sync**: `js/store.js` abonniert Postgres-Realtime auf allen Tabellen.
  Ändert das Personal etwas oder gibt ein Gast eine Bestellung auf, sehen alle
  offenen Tabs das binnen Millisekunden — jetzt wirklich geräteübergreifend,
  nicht nur innerhalb desselben Browsers wie in der ersten Prototyp-Fassung.
- **Zimmer/Sprache** bleiben bewusst pro Gerät in `localStorage` (kein Login
  für Gäste vorgesehen); ebenso, welche Postkarte ein Gerät schon gesehen hat.
- **Zimmer-Einrichtung** (`js/roomSetup.js`): Ein Tablet ohne gespeicherte
  Zimmernummer zeigt statt der App einen Einrichtungsbildschirm. Personal
  meldet sich dort einmalig mit dem Backoffice-Login an, wählt das Zimmer
  für dieses Gerät — danach wird die Session sofort wieder abgemeldet, nur
  die Zimmernummer bleibt gespeichert. Neu zuweisen (z. B. nach Tausch der
  Tablets zwischen Zimmern): `index.html?setup=1` öffnen und erneut anmelden.

Backoffice-Login anlegen: Supabase-Dashboard → *Authentication → Users* →
„Add user" (mit „Auto Confirm User"). Es gibt bewusst kein Self-Signup in
der App — neue Zugänge werden ausschliesslich im Dashboard vergeben. Dieser
Login schützt jetzt sowohl `admin.html` als auch die Zimmer-Einrichtung.

### Rollen fürs Personal

Jedes Konto hat eine Rolle — **Admin** (voller Zugriff plus Mitarbeiter-
verwaltung), **Rezeption** (voller Zugriff, Standard — aber ohne
Mitarbeiterverwaltung), **Küche** (nur Zimmerservice-Bestellungen),
**Housekeeping** (nur Housekeeping-Wünsche) oder **Spa** (nur Spa-Termine).
Die Rolle steckt im JWT (`app_metadata.role`) und wird sowohl im Backoffice
(Sidebar/Dashboard zeigen nur die passenden Einträge) als auch in der
Datenbank selbst über Row-Level-Security durchgesetzt (`current_staff_role()`
/ `is_full_access_staff()` in Postgres) — ein Küchen-Login kann also auch bei
direktem API-Zugriff keine Spa-Termine oder Hotelinhalte sehen oder ändern,
nicht nur in der Oberfläche versteckt.

**Mitarbeiter verwalten — nur Admin:** neue Konten per E-Mail einladen (Rolle
direkt mitgeben), Rollen bestehender Konten per Dropdown ändern, Passwort
eines Kontos zurücksetzen (verschickt eine E-Mail, die Person setzt ihr
Passwort selbst neu) oder ein Konto löschen. Ein Admin kann sich selbst nicht
die Admin-Rolle entziehen oder das eigene Konto löschen (verhindert
versehentliches Aussperren). Neu eingeladenes Personal legt sein Passwort
immer selbst über den E-Mail-Link fest — niemand sonst gibt oder sieht dieses
Passwort. Rezeption sieht diese Seite bewusst nicht mehr.

Das läuft über eine kleine Server-Funktion (`supabase/functions/manage-staff`),
weil Einladen/Löschen/Passwort-Zurücksetzen den geheimen „Service Role Key"
brauchen, der nie im Browser landen darf; die Funktion prüft selbst, dass nur
ein Admin-Konto sie aufrufen kann. Damit die Einladungs- und Reset-Mails auf
die richtige Seite verlinken, müssen `https://concierge.swissbaanchiang.com/admin.html`
und (für lokales Testen) `http://localhost:5173/admin.html` im Supabase-Dashboard
unter *Authentication → URL Configuration → Redirect URLs* eingetragen sein
(die alte `https://sbc26.github.io/Concierge/admin.html` kann zusätzlich stehen
bleiben, schadet nicht).

Alternativ geht es weiterhin auch klassisch über SQL (z. B. um einem
bestehenden Konto ohne Einladung eine Rolle zu geben):

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "kitchen"}'::jsonb
where email = 'kueche@example.com';
```

Gültige Werte: `admin`, `reception`, `kitchen`, `housekeeping`, `spa`. Ohne
gesetzte Rolle gilt automatisch `reception` (voller Zugriff, aber ohne
Mitarbeiterverwaltung) — bestehende Konten sind davon also nicht betroffen.

## Was schon funktioniert

- Gäste-Startbildschirm mit Zimmerservice, Housekeeping, Spa & Wellness, Taxi & Ausflügen, Hotelinfos, Bestellübersicht
- Speisekarte mit Warenkorb, Anmerkungen, Bestellung senden
- Housekeeping-Wünsche als Mehrfachauswahl inkl. Wunschzeit
- Spa-Terminbuchung mit Behandlung + Zeitfenster
- Taxi-Anfrage sowie buchbare Ausflüge
- Bestellstatus (Neu / In Bearbeitung / Erledigt) live einsehbar für Gäste
- Sprachumschaltung Deutsch / English / ไทย
- Digitale Postkarte vom Personal ans Gästegerät: Im Backoffice unter „Postkarte senden“ verfasst das Personal eine Grussbotschaft (Zimmer oder „Alle Zimmer“ wählbar, Schriftart Elegant/Handschrift/Modern), die auf dem passenden Gäste-Tablet automatisch als Overlay im Swiss-Baan-Chiang-Design (Gold/Teal, Airmail-Streifen, Briefmarke, Poststempel) erscheint — ganz ohne Zutun des Gasts
- Feste Zimmer-Zuordnung pro Tablet: Einrichtungsbildschirm (Login-geschützt) statt frei wählbarer Demo-Umschaltung; Neuzuweisung über `index.html?setup=1`
- QR-Code pro Zimmer fürs eigene Smartphone der Gäste (`index.html?room=Villa%20Jungfrau`, kein Login nötig) — Backoffice-Seite „QR-Codes fürs Zimmer" zum Herunterladen/Ausdrucken
- Backoffice-Dashboard: alle Bestellungen als Kanban (Neu / In Bearbeitung / Erledigt), Status per Klick ändern
- Backoffice-Inhaltspflege: WLAN, Öffnungszeiten, Willkommenstext, Hausregeln, Ausflugstipps, Speisekarte, Spa-Angebote, Taxi-Optionen — alles mehrsprachig editierbar, Artikel hinzufügen/entfernen
- Echtes Backend (Supabase) mit Login-Schutz fürs Backoffice und geräteübergreifender Live-Synchronisation über Realtime
- Rollen fürs Personal: Rezeption (voll), Küche, Housekeeping, Spa — jede Rolle sieht im Backoffice nur ihre relevanten Bestellungen, durchgesetzt per Row-Level-Security in der Datenbank (nicht nur in der Oberfläche versteckt)
- Mitarbeiterverwaltung direkt im Backoffice (nur Admin-Rolle): Personal per E-Mail einladen, Rollen zuweisen, Passwort zurücksetzen oder Konto löschen — ohne Supabase-Dashboard, das Personal setzt sein Passwort selbst über den E-Mail-Link
- Benachrichtigungen bei neuen Bestellungen: Ton (per Web Audio erzeugt, kein Audio-Asset nötig) plus Browser-Notification, solange das Backoffice in einem Tab offen ist — gefiltert nach Rolle (Küche hört nur bei neuen Zimmerservice-Bestellungen usw.). Aktivieren über den Button oben in der Sidebar, je Gerät/Browser einmalig.
- Eigene Domain (`concierge.swissbaanchiang.com`) statt `sbc26.github.io`, siehe "Eigene Domain" unten

### Eigene Domain

Die Seite läuft unter `concierge.swissbaanchiang.com` statt der GitHub-
Standardadresse. Eingerichtet über eine `CNAME`-Datei im Repo-Root (das ist
alles, was GitHub Pages dafür auf Code-Seite braucht) plus einem DNS-Eintrag
beim Registrar — hier Hostinger:

1. Hostinger hPanel → *Domains* → `swissbaanchiang.com` → *DNS/Nameserver* →
   *DNS-Zone bearbeiten*.
2. Eintrag hinzufügen: Typ `CNAME`, Name/Host `concierge`, Ziel/Zeigt auf
   `sbc26.github.io`, TTL Standard.
3. GitHub-Repo → *Settings → Pages*: Feld „Custom domain" sollte nach dem
   nächsten Push automatisch `concierge.swissbaanchiang.com` zeigen (kommt aus
   der `CNAME`-Datei). Sobald GitHub die DNS-Eintragung erkannt hat (Häkchen
   grün, kann nach dem DNS-Eintrag einige Minuten bis Stunden dauern), dort
   „Enforce HTTPS" aktivieren.
4. Im Supabase-Dashboard unter *Authentication → URL Configuration →
   Redirect URLs* `https://concierge.swissbaanchiang.com/admin.html`
   eintragen (siehe „Rollen fürs Personal" oben) — sonst funktionieren neue
   Einladungs-/Passwort-Reset-Links nicht mehr richtig.
5. QR-Codes fürs Zimmer sind bereits mit der neuen Domain neu erzeugt
   (`node generate-qrcodes.js`).

Status: abgeschlossen — DNS, GitHub Pages (inkl. „Enforce HTTPS") und der
Supabase-Redirect-URL-Eintrag stehen. `https://sbc26.github.io/Concierge/`
bleibt zusätzlich erreichbar, falls irgendwo noch die alte Adresse verlinkt ist.

## Nächste Schritte für den echten Einsatz

1. Professionelle Übersetzungen für neu angelegte Speisekarten-/Spa-Einträge
   (aktuell trägt das Personal alle drei Sprachen selbst ein).

**Bewusst zurückgestellt:** „Leaked Password Protection" in Supabase Auth
(prüft neue Passwörter gegen bekannte Datenlecks) — erst ab dem Pro-Plan
verfügbar, das Projekt läuft auf dem Free-Plan. Aufwand/Kosten stehen bei der
aktuellen Grösse (wenige, persönlich eingeladene Mitarbeiter-Konten) in keinem
Verhältnis zum Risiko — bewusste Entscheidung, kein offener Punkt.
