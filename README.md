# Swiss Baan Chiang — Concierge & Informationssystem

Klick-Prototyp für ein digitales Concierge-System: Gäste sehen Hotelinfos und
bestellen Leistungen über das Zimmer-Tablet oder ihr eigenes Smartphone.
Das Personal pflegt Inhalte und sieht eingehende Bestellungen über eine
Backoffice-Ansicht am PC.

## Struktur

- `index.html` + `js/app.js` — Gästeansicht (Tablet im Zimmer / Smartphone per QR-Code)
- `admin.html` + `js/admin.js` — Backoffice für das Personal (PC an der Rezeption)
- `js/data.js` — Beispieldaten (Speisekarte, Spa, Taxi, Ausflüge, Hotelinfos) in DE/EN/TH
- `js/i18n.js` — Übersetzungen der Bedienoberfläche
- `js/store.js` — gemeinsamer Datenspeicher (siehe "Wie die Live-Synchronisation funktioniert")
- `js/icons.js` — generiertes Icon-Set (siehe "Design-System")

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

## Wie die Live-Synchronisation funktioniert (Prototyp-Stand)

Es gibt noch keine echte Datenbank. Stattdessen teilen sich alle geöffneten
Tabs denselben Browser-Speicher (`localStorage` + `BroadcastChannel`):
Ändert das Personal im Backoffice einen Text, eine Preisangabe oder den
Status einer Bestellung, sehen alle offenen Gäste-Tabs das sofort — genau
das Verhalten, das ein echtes Backend später liefern würde.

**Wichtig:** Das funktioniert nur innerhalb desselben Browsers auf demselben
Gerät. Für den echten Betrieb (Tablets in unterschiedlichen Zimmern, Zugriff
vom Smartphone der Gäste) braucht es ein echtes Backend mit Datenbank —
siehe "Nächste Schritte".

## Was schon funktioniert

- Gäste-Startbildschirm mit Zimmerservice, Housekeeping, Spa & Wellness, Taxi & Ausflügen, Hotelinfos, Bestellübersicht
- Speisekarte mit Warenkorb, Anmerkungen, Bestellung senden
- Housekeeping-Wünsche als Mehrfachauswahl inkl. Wunschzeit
- Spa-Terminbuchung mit Behandlung + Zeitfenster
- Taxi-Anfrage sowie buchbare Ausflüge
- Bestellstatus (Neu / In Bearbeitung / Erledigt) live einsehbar für Gäste
- Sprachumschaltung Deutsch / English / ไทย
- Digitale Postkarte vom Personal ans Gästegerät: Im Backoffice unter „Postkarte senden“ verfasst das Personal eine Grussbotschaft (Zimmer oder „Alle Zimmer“ wählbar, Schriftart Elegant/Handschrift/Modern), die auf dem passenden Gäste-Tablet automatisch als Overlay im Swiss-Baan-Chiang-Design (Gold/Teal, Airmail-Streifen, Briefmarke, Poststempel) erscheint — ganz ohne Zutun des Gasts
- Zimmer-Auswahl zur Demo (in echt würde das Tablet fest einem Zimmer zugeordnet)
- Backoffice-Dashboard: alle Bestellungen als Kanban (Neu / In Bearbeitung / Erledigt), Status per Klick ändern
- Backoffice-Inhaltspflege: WLAN, Öffnungszeiten, Willkommenstext, Hausregeln, Ausflugstipps, Speisekarte, Spa-Angebote, Taxi-Optionen — alles mehrsprachig editierbar, Artikel hinzufügen/entfernen

## Nächste Schritte für den echten Einsatz

1. **Echtes Backend** (z. B. Supabase): Zimmer, Inhalte und Bestellungen in
   einer echten Datenbank statt localStorage; Bestellungen landen dann auch
   geräteübergreifend beim Personal.
2. **Zimmer-Zuordnung**: Tablet fest mit einer Zimmernummer verknüpfen (z. B.
   über eine Konfigurationsseite bei Ersteinrichtung), statt der Demo-Auswahl.
3. **QR-Code fürs Smartphone**: pro Zimmer ein QR-Code, der direkt auf
   `index.html` mit vorausgefüllter Zimmernummer verlinkt.
4. **Login fürs Personal** im Backoffice, ggf. mit Rollen (Rezeption, Küche,
   Housekeeping, Spa sehen nur ihre relevanten Bestellungen).
5. **Push-Benachrichtigungen** ans Personal bei neuen Bestellungen (z. B. Ton
   oder Browser-Notification im Backoffice).
6. Professionelle Übersetzungen für neu angelegte Speisekarten-/Spa-Einträge
   (aktuell trägt das Personal alle drei Sprachen selbst ein).
