# Kontomodell und Avatar-Asset-Workflow

Dieses Dokument hält die architektonischen Entscheidungen bezüglich Kontoführung und visuellen Avataren im FitFamily Dashboard fest.

---

## 1. Entscheidung Kontomodell: Lokale Profile statt E-Mail-Accounts

### Kontext und Fragestellung
Für FitFamily stand zur Debatte, ob persönliche Benutzerkonten mit E-Mail-Adresse und Passwort oder lokale Familienprofile verwendet werden sollen.

### Entscheidung
FitFamily verwendet **ausschließlich lokale Familienprofile** mit einem zentralen, per bcrypt geschützten **Eltern-PIN**. Persönliche E-Mail-Konten werden für Version 1.0 ausdrücklich **nicht** eingeführt.

### Begründung
1. **Autonomer Offline-Betrieb:** Der Wandmonitor im Sportraum läuft lokal im Heimnetz auf einem Ubuntu-PC oder Raspberry Pi. Ein System mit E-Mail-Verifikation würde eine Internetverbindung, einen SMTP-Dienst sowie Fehlertoleranz bei Netzausfällen erfordern.
2. **Kindergerechte Touch-Bedienung:** Kinder (wie Fabian und Frieda) besitzen oft keine eigene E-Mail-Adresse oder sollten am Touchdisplay im Trainingsraum nicht mit Passwörtern hantieren müssen. Ein Antippen des eigenen Profils genügt.
3. **Datensparsamkeit:** Ohne E-Mail-Adressen müssen keine personenbezogenen Kontaktdaten gespeichert werden. Alle Trainingsdaten verbleiben in der lokalen SQLite-Datenbank.
4. **Schutz sensibler Funktionen:** Änderungen an Stammdaten, Start-Fitness, Backups und API-Keys sind durch den Eltern-PIN gesichert.
5. **Mobil-Nutzung ohne Login:** Das Smartphone wird über einmalige, zeitlich begrenzte QR-Codes (Handoff-Token) oder NFC-Tags gekoppelt – ohne ein Cloud-Konto.

---

## 2. Avatar-Asset-Workflow

### Spezifikation für Avatar-Grafiken
- **Format:** WebP mit Alphakanal (transparenter Hintergrund).
- **Seitenverhältnis:** 1:2 (z. B. Standard `222 × 444 px`, High-DPI `444 × 888 px`).
- **Ausschnitt:** Exakt eine Einzelfigur, zentriert und am unteren Bildrand ausgerichtet (`object-position: center bottom`). Keine Anschnitte von Nachbarfiguren.
- **Speicherort:** `public/assets/avatars/<avatar-id>.webp`.

### Namenskonvention & Varianten-Workflow
1. **Basis-Bilder:**
   - `mama.webp`
   - `papa.webp`
   - `fabian.webp`
   - `frieda.webp`
2. **Entwicklungsbilder:**
   - Erwachsene haben sieben Fitnessstufen. Stufe 1–3 nutzen `mama-stageN.webp` bzw. `papa-stageN.webp`; Stufe 4–5 das Basisbild und Stufe 6–7 je nach Trainingsfokus `mama-strength.webp` / `mama-endurance.webp` bzw. `papa-strength.webp` / `papa-endurance.webp`.
   - Kinder haben drei Stufen ohne körperliche Veränderung. Sie wählen zwischen dem Basisbild und dem zweiten Design (`fabian-alt.webp` bzw. `frieda-alt.webp`).
   - Fitnessstufen und Trainingsfokus werden zusätzlich durch Level-Badges, Auren und Rahmen kenntlich gemacht (`avatar-physique-strength`, `avatar-physique-endurance`, `avatar-physique-balanced`).

### Bildrechte und Generierung
- FitFamily ist unter der **PolyForm Noncommercial License 1.0.0** lizenziert.
- Grafiken dürfen für den privaten, nicht-kommerziellen Gebrauch erstellt oder modifiziert werden.
- Bei KI-generierten Varianten müssen die Bestimmungen des jeweiligen Modell-Anbieters für private Zwecke eingehalten werden.
- Figuren sollen einen motivierenden, sportlich-positiven Charakter vermitteln, ohne abwertende Körperbilder oder unrealistische Klischees darzustellen.
