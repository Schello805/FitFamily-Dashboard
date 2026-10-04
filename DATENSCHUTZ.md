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

Optional lassen sich aufgezeichnete Trainingszeiten aus einem Apple-Health-XML/ZIP-Export über ein lokales Mac-Skript an den eigenen FitFamily-Server senden. Der vollständige Export bleibt auf dem Mac. Übertragen werden nur ausgewählte Workout-IDs, Start/Ende, aktive Dauer, Quellenname, Trainingsart, deren Kraft-/Ausdauer-Zuordnung und Profil-ID. Keine Schritte, Kalorien, Ringe oder anderen Health-Messungen. Trainingsdaten werden nicht an KI-Anbieter übertragen. Es gibt noch keine automatische iPhone-Synchronisierung.

Ein gemeinsamer Familienschlüssel gilt für alle Profile. Auf dem Server wird nur sein Hash gespeichert. Wer den Schlüssel kennt, kann für alle Familienprofile Trainings senden; deshalb privat halten. Ersetzen invalidiert ihn für alle Geräte. Die Eingabe erfolgt verdeckt im Terminal. HTTP im lokalen Netzwerk ist unverschlüsselt und benötigt ausdrückliche Freigabe; HTTPS ist vorzuziehen.

Testempfang verändert keine Wertung. Erst eine ausdrücklich gesendete Buchung (`--book --send`) berücksichtigt aktive Trainingsminuten mit 1,5 Punkten pro Minute für Ziele, Level und Verlauf. App-Timer im gewählten Health-Modus werden nicht zusätzlich gewertet. Duplikate/Überschneidungen werden blockiert. Test- und Buchungsdaten sowie Empfangsprotokolle werden lokal gespeichert und sind Bestandteil der Datensicherung; der Schlüsselhash ist aus portablen JSON-Exporten ausgeschlossen. Alte archivierte Health-Ringdaten/alte Workout-Importe bleiben unberücksichtigt. Details: [Trainingsimport](docs/HEALTH_TRAINING_TEST.md).
