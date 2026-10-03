# Datenschutz

FitFamily ist für den Betrieb im privaten Heimnetz konzipiert.

## Lokal gespeicherte Daten

- Profilname, Geburtstag, Avatar und optionale Körperwerte
- Trainingszeiten, Aktivitätsart, Geräteabschnitte und Score
- Trainingspläne, Ziele und Planhistorie
- Gerätekopplungen als nicht rückrechenbare Token-Hashes
- Änderungsprotokoll für sicherheitsrelevante Aktionen
- Optional hinzugefügte Musikdateien im Ordner `data/music/`

Alle vorhandenen Daten können im Elternbereich eingesehen und als JSON exportiert werden.

Lokale Musikdateien werden weder exportiert noch in NAS-Backups aufgenommen, damit Sicherungen klein bleiben und nur Musik gespeichert wird, zu der die Familie Nutzungsrechte besitzt.

## Externe Übertragungen

- Wetter: geografische Koordinaten von Bechhofen an Open-Meteo
- KI-Planung: nur Altersgruppe, Ziel, Niveau, Zeitbudget und Geräte an den ausgewählten Anbieter
- Übungsvideos werden nicht eingebettet. Erst beim bewussten Öffnen eines Links oder einer YouTube-Suche wird YouTube aufgerufen; dann gelten die Datenschutzregeln des Videodienstes.

Nicht an KI-Anbieter übertragen werden Namen, exakte Geburtstage, Gerätekennungen, Apple-Health-Rohdaten oder der vollständige Trainingsverlauf. OpenAI-Anfragen werden mit deaktivierter Antwortspeicherung (`store: false`) versendet.

## Backups

NAS-Backups sind mit AES-256-GCM verschlüsselt. Der Schlüssel bleibt auf dem Raspberry Pi und darf nicht gemeinsam mit dem Backup gespeichert werden.

## Apple Health

Die Anbindung ist vorerst eingestellt. Es werden keine neuen Health-Daten angenommen und keine Sync-Schlüssel erstellt. Bereits gespeicherte Daten bleiben lokal erhalten und werden nicht angezeigt oder für Trainingsberechnungen verwendet. Bestehende Backups bleiben kompatibel; sie können archivierte Daten weiterhin enthalten.
