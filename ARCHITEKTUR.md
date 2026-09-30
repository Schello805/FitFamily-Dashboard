# Architektur

FitFamily ist als lokale, modulare Web-Anwendung aufgebaut.

## Bausteine

- **Next.js/React:** gemeinsame responsive Oberfläche für Wandmonitor und Handy
- **Route Handler:** lokale JSON-API für Training, Pläne, Kopplung und Export
- **libSQL/SQLite:** transaktionale Einzeldatei-Datenbank auf dem Raspberry Pi
- **PWA:** installierbare Handy-Web-App und Offline-Grundgerüst
- **Adapter:** OpenAI und Gemini sind austauschbar; lokale Planung bleibt verfügbar

## Trainingszustand

Eine `training_session` gehört zu genau einem Profil und enthält beliebig viele `training_segments`. Ein Wechsel beendet das offene Segment und beginnt atomar das nächste. Dadurch können Kraft, Ausdauer und einzelne Geräte sekundengenau ausgewertet werden. Pro Profil existiert höchstens eine aktive Sitzung; verschiedene Profile laufen unabhängig parallel.

## Sicherheitsgrenzen

- Stammdaten und Verlauf liegen lokal.
- API-Schlüssel werden ausschließlich als Server-Umgebungsvariablen gelesen.
- Eltern-PINs werden mit bcrypt gehasht.
- Gerätekopplungen speichern nur SHA-256-Hashes zufälliger Tokens.
- QR-Übergaben sind einmalig und zehn Minuten gültig.
- NFC-URLs identifizieren eine Übung; das gekoppelte Handy identifiziert die Person.

## Skalierung

Die aktuelle SQLite-Datenbank ist für einen Familienhaushalt ausreichend und minimiert Wartung. Domänenlogik und API sind von der Oberfläche getrennt, sodass später native Apps oder eine andere Datenbank ergänzt werden können.

## Release-Version

Der Footer verwendet `NEXT_PUBLIC_APP_VERSION` aus dem Release-Build und fällt lokal auf die Version aus `package.json` zurück. Dadurch entspricht die sichtbare Revision automatisch dem veröffentlichten Tag.
