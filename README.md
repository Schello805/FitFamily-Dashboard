# FitFamily Dashboard

Das lokale Familien-Fitnessdashboard für einen Touchmonitor im Sportraum. FitFamily läuft auf einem Raspberry Pi, erfasst parallele Kraft- und Ausdauertrainings und lässt sich ohne Cloud-Konto am Monitor oder Handy bedienen.

> Status: frühe Version 0.1.0. Kernfunktionen sind nutzbar; die Roadmap bis Version 1.0 ist in [ROADMAP.md](ROADMAP.md) dokumentiert.

## Highlights

- Vier große, touchfreundliche Familienprofile
- Mehrere gleichzeitig laufende Trainings
- Kraft: 1 Punkt/Minute, Ausdauer: 2 Punkte/Minute
- Automatische Sicherheits-Pause nach vier Stunden
- Handy-Übergabe über einmalige QR-Codes
- NFC-Endpunkte pro Gerät oder Übung
- Persönlicher Verlauf und geschütztes Nachtragen
- Trainingspläne mit OpenAI, Gemini oder lokaler Vorlage
- Wetter für Bechhofen, Ruhemodus-Konzept und installierbare Web-App
- Lokaler Musikplayer mit Playlist, Lautstärke und Upload eigener Audiodateien
- Lokale SQLite-Datenbank, JSON-Export und verschlüsselte NAS-Backups
- Keine Kamera und keine Körperüberwachung

## Schnellstart für Entwicklung

Voraussetzungen: Node.js 22 oder neuer und npm.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Danach `http://localhost:3000` öffnen. Beim ersten Start führt ein QR-Code zur mobilen Einrichtung.

## Raspberry Pi

Unterstützt werden Raspberry Pi 4 (empfohlen) und Raspberry Pi 3B mit reduzierten Animationen. Die vollständige Einrichtung inklusive Kioskmodus und automatischem Start beschreibt [docs/INSTALLATION_RASPBERRY_PI.md](docs/INSTALLATION_RASPBERRY_PI.md).

## KI-Anbieter

KI ist optional. Ohne Schlüssel erstellt FitFamily lokale Vorlagen. Schlüssel gehören ausschließlich in `.env.local` auf dem Raspberry Pi:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

An Anbieter werden nur anonymisierte Planparameter übermittelt. Namen, Geburtstage und Apple-Health-Daten verlassen das Gerät nicht. Mehr dazu in [DATENSCHUTZ.md](DATENSCHUTZ.md).

## NFC

Ein Tag verweist auf `/nfc/<uebungs-id>`. Ein unbekanntes Handy fragt einmalig nach Besitzer und Eltern-PIN. Danach startet oder wechselt ein Scan automatisch die passende Aktivität. Beispiele und Tagliste stehen in [docs/NFC.md](docs/NFC.md).

## Musik

Die Musiksteuerung befindet sich oben rechts auf dem Dashboard. Eigene MP3-, M4A-, AAC-, OGG-, WAV-, FLAC- oder WEBM-Dateien können dort mit dem Eltern-PIN hinzugefügt und über die Lautsprecher des Dashboard-PCs abgespielt werden. Musikdateien liegen nur im lokalen Ordner `data/music/`; das Projekt liefert keine Musik mit.

## Qualität

```bash
npm run verify
```

Der Befehl prüft ESLint, TypeScript, Tests und den Produktions-Build.

## Projektstruktur

- `src/app` – Seiten und lokale API-Endpunkte
- `src/components` – Touch- und Handyoberflächen
- `src/lib` – Datenbank, Sicherheit und Trainingslogik
- `scripts` – Backup und Raspberry-Pi-Betrieb
- `docs` – Installation und Betrieb

Das Markenlogo liegt unter `public/assets/fitfamily-logo.png`. Die Fußzeile zeigt Projektinhaber, GitHub-Verweis und die Release-Version.

Die technischen Entscheidungen erklärt [ARCHITEKTUR.md](ARCHITEKTUR.md).

## Gesundheitshinweis

FitFamily ist ein Motivations- und Organisationstool, kein Medizinprodukt. Trainingspläne und Fitnesswerte ersetzen keine ärztliche oder professionelle sportfachliche Beratung. Bei Schmerzen, Schwindel oder Unwohlsein Training beenden.

## Lizenz

Copyright © Michael Schellenberger.

Dieses Projekt ist **Source Available** unter der [PolyForm Noncommercial License 1.0.0](LICENSE.md). Private und nichtkommerzielle Nutzung ist erlaubt; kommerzielle Nutzung ist untersagt. Aufgrund dieser Einschränkung ist die Software nicht „Open Source“ im Sinne der Open Source Initiative.

## Mitwirken

Fehlerberichte und nichtkommerzielle Beiträge sind willkommen. Bitte zuerst [CONTRIBUTING.md](CONTRIBUTING.md) und [SECURITY.md](SECURITY.md) lesen.
