# Änderungsprotokoll

Alle wichtigen Änderungen werden hier nach dem Prinzip von Keep a Changelog dokumentiert.

## [Unreleased]

## [0.3.7] – 2026-10-04

### Geändert

- Verwaltung prüft die Eltern-PIN automatisch nach der vierten Ziffer, auch bei eingefügter PIN. Der separate Entsperren-Button entfällt; doppelte Anfragen sind blockiert, Fehlversuche leeren die Eingabe für den nächsten Versuch.

## [0.3.6] – 2026-10-04

### Behoben

- Verlaufsdiagramme verwenden auf Dashboard und Detailansicht einheitliches Türkis statt der Profilfarbe. Neutraler Hintergrund und Fokusrahmen verhindern orange Diagramme im Dark Mode; Profilakzente bleiben außerhalb des Diagramms erhalten.

## [0.3.5] – 2026-10-04

### Geändert

- Automatischer Trainingslevel deutlich hervorgehoben, auch als Level-Abzeichen an der Figur; Fortschrittsanzeige erläutert die verbleibenden Minuten und gleiche Wertung von Kraft und Ausdauer.
- Manuelle Fitness-Selbsteinschätzung klar separat beschriftet. Sie steuert weiterhin die Figur, nicht den automatischen Trainingslevel.

## [0.3.4] – 2026-10-03

### Hinzugefügt

- Geräte-Auswertung pro Profil im Trainingsverlauf: sekundengenau summierte Zeit, Kraft-/Ausdauer-Anteile, Anzahl genutzter Einheiten und letzte Nutzung; auch noch nicht genutzte Geräte sind sichtbar.
- Geräte-Gesamtsummen umfassen die gesamte Historie unabhängig von der Begrenzung der Eintragsliste. Laufende Einheiten und Apple-Health-Daten zählen nicht mit; Geräte ohne Zuordnung bleiben separat.

## [0.3.3] – 2026-10-03

### Hinzugefügt

- Geräte- und Übungslinks für NFC sowie druckbare QR-Etiketten in Verwaltung → Sportraum.
- Änderbare Kraft-/Ausdauer-Zuordnung und Standardübung je Gerät, dauerhaft in Backup und Datenexport gespeichert.
- Mobile Trainingsseite mit Geräte-Timer und zentralem Stopp; Gerätewechsel schließen den vorherigen Abschnitt ohne Zeitlücke ab.
- Eigenständiger Trainingslevel mit Fortschrittsbalken und drei Abzeichen, unabhängig von Fitness-Selbsteinschätzung und Punkte-Reset.

### Behoben

- Gleichzeitige Scans desselben Profils erzeugen keine überlappenden Trainingsabschnitte mehr.
- PIN-Eingabe beim Handy-Koppeln verwendet das Numpad; Timer starten ohne Server-/Browser-Darstellungsfehler.
- Dashboard-Karten passen mit Fortschrittsanzeige auch bei 650 Pixeln Bildschirmhöhe in die Ansicht.

## [0.3.0–0.3.2] – 2026-10-03

### Geändert

- Apple Health vorerst eingestellt: Oberfläche, Ringe, Einrichtung und Generator entfernt; alte Sync-Endpunkte verweigern weitere Übertragungen mit HTTP 410.
- Fortschritt, Punkte, Trainingszeit und Diagramme berücksichtigen nur FitFamily-Training. Archivierte Health-Daten und Backup-Kompatibilität bleiben erhalten.
- Zwei Trainings-Einstiege im Profil: Kraft/Ausdauer direkt starten oder den persönlichen KI-Trainingsplan öffnen.

### Hinzugefügt

- Geräte-PDFs separat von Übungsvideos verwalten und in der Trainingseinheit anzeigen
- Automatische Browser-Aktualisierung nach App-Updates
- Lokales Dashboard und mobile Profilansicht
- Parallele Kraft- und Ausdauertimer
- NFC-Gerätewechsel und sichere QR-Übergabe
- Verlauf, manuelle Einträge und Trainingsplanerstellung
- Raspberry-Pi-, Datenschutz- und Sicherheitsgrundlagen

## [0.1.0] – 2026-09-30

- Initiales Projektgerüst.
